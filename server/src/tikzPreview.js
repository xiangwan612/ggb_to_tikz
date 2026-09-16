import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_CODE_LENGTH = 200_000;
const COMPILE_TIMEOUT_MS = 20_000;
const FORBIDDEN_TEX = /\\(?:input|include|openin|openout|read|write|immediate|special|directlua|usepackage|documentclass|begin\s*\{document\}|end\s*\{document\})\b/i;

function extractTikzPicture(code) {
  const text = String(code || '').trim();
  const match = text.match(/\\begin\s*\{tikzpicture\}[\s\S]*?\\end\s*\{tikzpicture\}/i);
  return match ? match[0] : text;
}

function buildDocument(code) {
  return `\\documentclass[tikz,border=3pt]{standalone}
\\usepackage{tikz}
\\usetikzlibrary{arrows.meta,calc,intersections,3d,angles,quotes}
\\begin{document}
${extractTikzPicture(code)}
\\end{document}
`;
}

async function findExecutable(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next common installation path.
    }
  }
  return '';
}

function conciseLatexError(output) {
  const text = String(output || '');
  const bang = text.match(/^!\s*(.+)$/m);
  const line = text.match(/^l\.\d+\s+(.+)$/m);
  if (bang) return `${bang[1]}${line ? `（${line[1].trim()}）` : ''}`;
  const tail = text.split('\n').map((item) => item.trim()).filter(Boolean).slice(-8);
  return tail.join(' ') || 'LaTeX 编译失败';
}

async function compileTikzPreview(code) {
  const latex = await findExecutable(['/Library/TeX/texbin/pdflatex', '/usr/local/bin/pdflatex', '/usr/bin/pdflatex']);
  const pdfToPng = await findExecutable(['/usr/bin/sips']);
  if (!latex || !pdfToPng) {
    const error = new Error('本机未安装完整 LaTeX（需要 pdflatex）');
    error.code = 'LATEX_UNAVAILABLE';
    throw error;
  }

  const workDir = await mkdtemp(path.join(tmpdir(), 'ggb-tikz-'));
  const texPath = path.join(workDir, 'preview.tex');
  const pdfPath = path.join(workDir, 'preview.pdf');
  const pngPath = path.join(workDir, 'preview.png');

  try {
    await writeFile(texPath, buildDocument(code), 'utf8');
    try {
      await execFileAsync(latex, [
        '-interaction=nonstopmode',
        '-halt-on-error',
        '-no-shell-escape',
        `-output-directory=${workDir}`,
        texPath
      ], { cwd: workDir, timeout: COMPILE_TIMEOUT_MS, maxBuffer: 2_000_000 });
    } catch (error) {
      const log = await readFile(path.join(workDir, 'preview.log'), 'utf8').catch(() => error.stdout || error.stderr || '');
      const compileError = new Error(conciseLatexError(log));
      compileError.code = error.killed ? 'LATEX_TIMEOUT' : 'LATEX_COMPILE_FAILED';
      throw compileError;
    }

    await execFileAsync(pdfToPng, ['-s', 'format', 'png', pdfPath, '--out', pngPath], {
      cwd: workDir,
      timeout: COMPILE_TIMEOUT_MS,
      maxBuffer: 2_000_000
    });
    await execFileAsync(pdfToPng, ['-Z', '1600', pngPath], {
      cwd: workDir,
      timeout: COMPILE_TIMEOUT_MS,
      maxBuffer: 2_000_000
    });

    const [png, pdf] = await Promise.all([readFile(pngPath), readFile(pdfPath)]);
    return {
      image: `data:image/png;base64,${png.toString('base64')}`,
      pdf: `data:application/pdf;base64,${pdf.toString('base64')}`
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function registerTikzPreviewRoute(app) {
  app.post('/api/tikz/compile', async (request, reply) => {
    const code = String(request.body?.code || '').trim();
    if (!code) return reply.code(400).send({ code: 'EMPTY_TIKZ', message: 'TikZ 代码为空' });
    if (code.length > MAX_CODE_LENGTH) {
      return reply.code(413).send({ code: 'TIKZ_TOO_LARGE', message: 'TikZ 代码过长' });
    }
    if (!/\\begin\s*\{tikzpicture\}/i.test(code)) {
      return reply.code(400).send({ code: 'MISSING_TIKZPICTURE', message: '未找到 tikzpicture 环境' });
    }
    if (FORBIDDEN_TEX.test(code)) {
      return reply.code(400).send({ code: 'UNSAFE_TEX', message: '预览代码包含文件或文档级命令，已拒绝执行' });
    }

    try {
      const result = await compileTikzPreview(code);
      return { engine: 'latex', mimeType: 'image/png', ...result };
    } catch (error) {
      const unavailable = error.code === 'LATEX_UNAVAILABLE';
      request.log.warn({ err: error }, 'TikZ preview compilation failed');
      return reply.code(unavailable ? 503 : 422).send({
        code: error.code || 'TIKZ_COMPILE_FAILED',
        message: error.message || 'TikZ 编译失败'
      });
    }
  });

  app.post('/api/tikz/copy-pdf', async (request, reply) => {
    const raw = String(request.body?.pdf || '');
    const base64 = raw.replace(/^data:application\/pdf;base64,/, '');
    if (!base64 || base64.length > 4_000_000 || !/^[A-Za-z0-9+/=]+$/.test(base64)) {
      return reply.code(400).send({ code: 'INVALID_PDF', message: '矢量 PDF 数据无效' });
    }
    const osascript = await findExecutable(['/usr/bin/osascript']);
    if (!osascript) {
      return reply.code(501).send({ code: 'CLIPBOARD_UNAVAILABLE', message: '当前系统不支持 PDF 剪切板' });
    }

    const workDir = await mkdtemp(path.join(tmpdir(), 'ggb-pdf-'));
    const pdfPath = path.join(workDir, 'tikz-preview.pdf');
    const script = `ObjC.import('AppKit'); ObjC.import('Foundation');
function run(argv) {
  const data = $.NSData.dataWithContentsOfFile(argv[0]);
  const item = $.NSPasteboardItem.alloc.init;
  item.setDataForType(data, $.NSPasteboardTypePDF);
  const board = $.NSPasteboard.generalPasteboard;
  board.clearContents;
  return board.writeObjects([item]) ? 'ok' : 'failed';
}`;
    try {
      await writeFile(pdfPath, Buffer.from(base64, 'base64'));
      const { stdout } = await execFileAsync(osascript, ['-l', 'JavaScript', '-e', script, pdfPath], {
        timeout: 10_000,
        maxBuffer: 100_000
      });
      if (!String(stdout).includes('ok')) throw new Error('系统剪切板写入失败');
      return { ok: true };
    } catch (error) {
      request.log.warn({ err: error }, 'Copy PDF to clipboard failed');
      return reply.code(500).send({ code: 'COPY_PDF_FAILED', message: error.message || '写入剪切板失败' });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
}
