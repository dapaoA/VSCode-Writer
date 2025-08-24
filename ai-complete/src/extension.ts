import * as vscode from 'vscode';

const CFG = 'aiComplete';
const SECRET_KEY_OPENAI = 'aiComplete.openai.apiKey';
const SECRET_KEY_DEEPSEEK = 'aiComplete.deepseek.apiKey';
let gVariantNonce = 0; // 每次再生时递增，用于轻微扰动采样

// 开启写作模式时建议应用的编辑器设置；关闭时恢复
const RECOMMENDED_EDITOR_SETTINGS: Record<string, any> = {
  'editor.wordWrap': 'on',
  'editor.selectionHighlight': false,
  'editor.occurrencesHighlight': false,
  'editor.renderLineHighlight': 'none'
};
const STORAGE_PREV_SETTINGS = 'aiComplete.prevEditorSettings';

type QuickMode = 'category' | 'menu' | 'adj' | 'noun' | 'verb' | 'rhetoric' | 'custom' | undefined;
let quickMode: QuickMode = undefined;
let quickCandidates: string[] = [];
let quickRequirement: string | undefined = undefined;
let quickSuspendTimer: NodeJS.Timeout | undefined = undefined; // 用于临时暂停内联续写

function scheduleQuickResume(ms = 5000) {
  if (quickSuspendTimer) { clearTimeout(quickSuspendTimer); }
  quickSuspendTimer = setTimeout(() => { quickMode = undefined; quickSuspendTimer = undefined; }, ms);
}

export function activate(ctx: vscode.ExtensionContext) {

  // 设置 OpenAI API Key（存 SecretStorage）
  ctx.subscriptions.push(
    vscode.commands.registerCommand('aiComplete.setOpenAIApiKey', async () => {
      const v = await vscode.window.showInputBox({
        prompt: '输入 OpenAI API Key（sk-开头）',
        password: true,
        ignoreFocusOut: true
      });
      if (v) {
        await ctx.secrets.store(SECRET_KEY_OPENAI, v);
        vscode.window.showInformationMessage('已保存 OpenAI API Key（保存在 VS Code Secret Storage 中）');
      }
    })
  );

  // 设置 DeepSeek API Key（存 SecretStorage）
  ctx.subscriptions.push(
    vscode.commands.registerCommand('aiComplete.setDeepSeekApiKey', async () => {
      try {
        console.log('DeepSeek API Key command executed');
        const v = await vscode.window.showInputBox({
          prompt: '输入 DeepSeek API Key',
          password: true,
          ignoreFocusOut: true
        });
        if (v) {
          await ctx.secrets.store(SECRET_KEY_DEEPSEEK, v);
          vscode.window.showInformationMessage('已保存 DeepSeek API Key（保存在 VS Code Secret Storage 中）');
        }
      } catch (error) {
        console.error('DeepSeek API Key command error:', error);
        vscode.window.showErrorMessage(`设置 DeepSeek API Key 时出错: ${error}`);
      }
    })
  );

  // 显示对话面板（已移除实现）
  // ctx.subscriptions.push(
  //   vscode.commands.registerCommand('aiComplete.showChatPanel', () => {
  //     vscode.commands.executeCommand('ai-complete-chat-panel.focus');
  //   })
  // );

  // 提供给webview获取密钥（内部命令）
  ctx.subscriptions.push(
    vscode.commands.registerCommand('aiComplete.getOpenAIKey', async () => {
      return await ctx.secrets.get(SECRET_KEY_OPENAI);
    })
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand('aiComplete.getDeepSeekKey', async () => {
      return await ctx.secrets.get(SECRET_KEY_DEEPSEEK);
    })
  );

  // 开关
  ctx.subscriptions.push(
    vscode.commands.registerCommand('aiComplete.toggle', async () => {
      const cfg = vscode.workspace.getConfiguration();
      const enabled = cfg.get<boolean>(`${CFG}.enabled`, true);
      const newEnabled = !enabled;
      await cfg.update(`${CFG}.enabled`, newEnabled, true);

      try {
        if (newEnabled) {
          // 记录原值
          const prev: Record<string, any> = {};
          for (const key of Object.keys(RECOMMENDED_EDITOR_SETTINGS)) {
            prev[key] = cfg.get(key);
          }
          await ctx.globalState.update(STORAGE_PREV_SETTINGS, prev);
          // 应用推荐设置
          for (const [key, val] of Object.entries(RECOMMENDED_EDITOR_SETTINGS)) {
            await cfg.update(key, val, vscode.ConfigurationTarget.Global);
          }
        } else {
          // 恢复原值
          const prev = (await ctx.globalState.get<Record<string, any>>(STORAGE_PREV_SETTINGS)) || {};
          for (const key of Object.keys(RECOMMENDED_EDITOR_SETTINGS)) {
            if (Object.prototype.hasOwnProperty.call(prev, key)) {
              await cfg.update(key, prev[key], vscode.ConfigurationTarget.Global);
            }
          }
          await ctx.globalState.update(STORAGE_PREV_SETTINGS, undefined);
        }
      } catch (e) {
        console.error('apply editor settings failed:', e);
      }

      vscode.window.showInformationMessage(`AI Complete: ${newEnabled ? '已开启（已应用写作编辑设置）' : '已关闭（已恢复原设置）'}`);
    })
  );

  // 再生当前建议（触发一次新的内联建议）
  ctx.subscriptions.push(
    vscode.commands.registerCommand('aiComplete.regenerate', async () => {
      try {
        await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
      } catch {}
      gVariantNonce++;
      await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    })
  );

  // 显示对话面板
  ctx.subscriptions.push(
    vscode.commands.registerCommand('aiComplete.showChatPanel', () => {
      vscode.commands.executeCommand('ai-complete-chat-panel.focus');
    })
  );

  // 已移除侧栏注册

  // 快速写作选单（内联类别选择）：Ctrl+Shift+K 直接在光标处用 Suggest Widget 展示类别
  ctx.subscriptions.push(
    vscode.commands.registerCommand('aiComplete.quickSuggest', async () => {
      quickMode = 'category';
      scheduleQuickResume();
      await vscode.commands.executeCommand('editor.action.triggerSuggest');
    })
  );

  // 注册 Inline Completion（Markdown & Plaintext）
  const selector: vscode.DocumentSelector = [
    { language: 'markdown' },
    { language: 'plaintext' }
  ];
  const provider = new WritingInlineProvider(ctx);

  ctx.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(selector, provider)
  );

  // 使用建议小框体（Suggest Widget）来展示候选词，并在选择后插入
  ctx.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, new CategoryCompletionProvider(ctx))
  );

  // 在文本变化时重置 quick 模式
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(() => {
      quickMode = undefined;
      quickCandidates = [];
      quickRequirement = undefined;
    })
  );

  // 数字直达类别
  ctx.subscriptions.push(vscode.commands.registerCommand('aiComplete.quickAdj', async () => {
    await showCategoryCandidates(ctx, '1');
  }));
  ctx.subscriptions.push(vscode.commands.registerCommand('aiComplete.quickNoun', async () => {
    await showCategoryCandidates(ctx, '2');
  }));
  ctx.subscriptions.push(vscode.commands.registerCommand('aiComplete.quickVerb', async () => {
    await showCategoryCandidates(ctx, '3');
  }));
  ctx.subscriptions.push(vscode.commands.registerCommand('aiComplete.quickRhetoric', async () => {
    await showCategoryCandidates(ctx, '4');
  }));
  ctx.subscriptions.push(vscode.commands.registerCommand('aiComplete.quickCustom', async () => {
    const requirement = await vscode.window.showInputBox({ prompt: '描述你的需求（如更精准的颜色词/补一句隐喻）', ignoreFocusOut: true });
    if (!requirement) return;
    await showCustomInfill(ctx, requirement);
  }));
}

class WritingInlineProvider implements vscode.InlineCompletionItemProvider {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null | undefined> {
    // 若正处于 QuickSuggest 交互（类别/候选选择期间），暂停自动续写，避免干扰
    if (quickMode === 'category' || quickMode === 'menu') {
      return;
    }
    const enabled = vscode.workspace.getConfiguration().get<boolean>(`${CFG}.enabled`, true);
    if (!enabled) return;

    // 仅当光标前K个字符全部为空白时抑制建议（允许多次换段后继续触发）
    const prevWindow = getContextBeforePosition(document, position, 10);
    if (/^\s*$/.test(prevWindow)) return;

    const maxCtx = vscode.workspace.getConfiguration().get<number>(`${CFG}.maxCharsContext`, 2000);
    const maxOut = vscode.workspace.getConfiguration().get<number>(`${CFG}.maxSuggestionChars`, 140);

    // 判断是否处于段落中间（光标后仍有非空白内容）以决定使用“填补”还是“续写”提示词
    const afterWindow = getContextAfterPosition(document, position, 50);
    const isInfill = afterWindow.trim().length > 0;

    const prompt = isInfill
      ? buildInfillingPrompt(document, position, maxCtx, maxOut)
      : buildPrompt(document, position, maxCtx, maxOut);

    // 轻微扰动温度以提高“再生”差异性（对 VS Code LM 无法设置温度，仅对回退通道生效）
    const temperature = 0.7 + ((gVariantNonce % 5) * 0.05);

    // 1) 优先尝试 VS Code Language Model API
    let suggestion = await tryVsCodeLM(prompt, maxOut, token).catch(() => undefined);

    // 2) 回退到 OpenAI、DeepSeek 或 Ollama
    if (!suggestion) {
      const providerPref = vscode.workspace.getConfiguration().get<string>(`${CFG}.provider`, 'auto');
      if (providerPref === 'openai' || providerPref === 'auto') {
        suggestion = await tryOpenAI(this.ctx, prompt, maxOut, temperature, token).catch(() => undefined);
      }
      if (!suggestion && (providerPref === 'deepseek' || providerPref === 'auto')) {
        suggestion = await tryDeepSeek(this.ctx, prompt, maxOut, temperature, token).catch(() => undefined);
      }
      if (!suggestion && (providerPref === 'ollama' || providerPref === 'auto')) {
        suggestion = await tryOllama(prompt, maxOut, token).catch(() => undefined);
      }
    }

    if (!suggestion) return;

    // 清理：只要纯文本，不要 Markdown 包装/代码围栏
    suggestion = sanitizePlainText(suggestion).slice(0, maxOut).trim();

    if (!suggestion) return;

    // 替换当前光标处到行尾（更像"续写"）
    const range = new vscode.Range(position, position);
    const item = new vscode.InlineCompletionItem(suggestion, range);
    return [item];
  }
}

// 获取光标前指定字符数的上下文，用于判断是否有足够内容触发补全
function getContextBeforePosition(
  document: vscode.TextDocument,
  position: vscode.Position,
  charCount: number
): string {
  const start = new vscode.Position(0, 0);
  const range = new vscode.Range(start, position);
  const text = document.getText(range);
  return text.slice(Math.max(0, text.length - charCount));
}

// 获取光标后指定字符数的上下文，用于判断是否处于段落中间以及做“填补”
function getContextAfterPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
  charCount: number
): string {
  const end = new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
  const range = new vscode.Range(position, end);
  const text = document.getText(range);
  return text.slice(0, Math.max(0, charCount));
}

function buildPrompt(
  document: vscode.TextDocument,
  position: vscode.Position,
  maxCtx: number,
  maxOut: number
): string {
  const before = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const ctxText = before.slice(Math.max(0, before.length - maxCtx));
  const tmpl = getPromptTemplate('continuation').replace('{{maxOut}}', String(maxOut));
  return tmpl + ctxText;
}

// 构建“填补”提示词：使用光标前后文，要求补齐中间缺失的词语/短语/语句
function buildInfillingPrompt(
  document: vscode.TextDocument,
  position: vscode.Position,
  maxCtx: number,
  maxOut: number
): string {
  const beforeAll = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const beforeCtx = beforeAll.slice(Math.max(0, beforeAll.length - Math.floor(maxCtx / 2)));
  const end = new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
  const afterAll = document.getText(new vscode.Range(position, end));
  const afterCtx = afterAll.slice(0, Math.floor(maxCtx / 2));
  const h = getPromptTemplate('infilling').replace('{{maxOut}}', String(maxOut));
  const mid = getPromptTemplate('infillingAfterHeader');
  const f = getPromptTemplate('infillingFooter');
  return h + beforeCtx + mid + afterCtx + f;
}

// 自定义 INFILL：用户额外说明需求（如"补一个隐喻"）
function buildCustomInfillingPrompt(
  document: vscode.TextDocument,
  position: vscode.Position,
  maxCtx: number,
  requirement: string
): string {
  const beforeAll = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const beforeCtx = beforeAll.slice(Math.max(0, beforeAll.length - Math.floor(maxCtx / 2)));
  const end = new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
  const afterAll = document.getText(new vscode.Range(position, end));
  const afterCtx = afterAll.slice(0, Math.floor(maxCtx / 2));
  const tmpl = getPromptTemplate('customInfilling').replace('{{requirement}}', requirement);
  return tmpl + beforeCtx + '\n\nAfter:\n' + afterCtx + '\n\nInsert here:';
}

// 根据类别生成候选列表（形容词/名词/动词/修辞）
function buildCategoryPrompt(
  document: vscode.TextDocument,
  position: vscode.Position,
  maxCtx: number,
  categoryDigit: string
): string {
  const beforeAll = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const beforeCtx = beforeAll.slice(Math.max(0, beforeAll.length - maxCtx));

  const categoryMap: Record<string, string> = {
    '1': 'adjectives (形容词/短形容搭配)',
    '2': 'nouns (名词/名词短语)',
    '3': 'verbs (动词/动词短语)',
    '4': 'rhetoric (修辞/隐喻/意象/感官描写短语或一句话)'
  };
  const type = categoryMap[categoryDigit] || 'expressions';

  const tmpl = getPromptTemplate('category').replace('{{type}}', type);
  return tmpl + beforeCtx;
}

function getPromptTemplate(key: string): string {
  try {
    const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0].uri || vscode.Uri.file(''), 'ai-complete', 'resources', 'prompt', 'prompts.json');
    const buf = require('fs').readFileSync(uri.fsPath, 'utf8');
    const json = JSON.parse(buf);
    return String(json[key] || '');
  } catch {
    return '';
  }
}

// 请求统一入口：按 provider 链路回退
async function requestFromModels(
  ctx: vscode.ExtensionContext,
  providerPref: string,
  prompt: string,
  maxOut: number,
  temperature: number
): Promise<string | undefined> {
  // 优先 VS Code LM
  let suggestion = await tryVsCodeLM(prompt, maxOut, new vscode.CancellationTokenSource().token).catch(() => undefined);
  if (suggestion) return suggestion;

  // 回退
  if (providerPref === 'openai' || providerPref === 'auto') {
    suggestion = await tryOpenAI(ctx, prompt, maxOut, temperature, new vscode.CancellationTokenSource().token).catch(() => undefined);
  }
  if (!suggestion && (providerPref === 'deepseek' || providerPref === 'auto')) {
    suggestion = await tryDeepSeek(ctx, prompt, maxOut, temperature, new vscode.CancellationTokenSource().token).catch(() => undefined);
  }
  if (!suggestion && (providerPref === 'ollama' || providerPref === 'auto')) {
    suggestion = await tryOllama(prompt, maxOut, new vscode.CancellationTokenSource().token).catch(() => undefined);
  }
  return suggestion;
}

// 将多行候选文本解析为候选数组（兼容带编号或无编号）
function parseCandidateList(raw: string): string[] {
  const text = sanitizePlainText(raw).trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map(l => l.replace(/^\d+\.?\)?\s*/, ''));
}

// === VS Code Language Model API 路径 ===
async function tryVsCodeLM(
  prompt: string,
  maxOut: number,
  token: vscode.CancellationToken
): Promise<string | undefined> {
  // 仅在 VS Code 提供 lm API 且用户同意的情况下可用
  // 这里选择 family 为 gpt-4o-mini（更偏交互/编辑场景）。如不可用会返回空数组。
  const models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
  if (!models || models.length === 0) return undefined;

  const [model] = models;
  const messages = [vscode.LanguageModelChatMessage.User(prompt)];

  const resp = await model.sendRequest(messages, {}, token);
  let text = '';
  for await (const frag of resp.text) {
    text += frag;
    if (text.length >= maxOut) break;
    if (token.isCancellationRequested) break;
  }
  return text;
}

// === OpenAI 回退路径（使用 SecretStorage 保存 key） ===
async function tryOpenAI(
  ctx: vscode.ExtensionContext,
  prompt: string,
  maxOut: number,
  temperature: number,
  token: vscode.CancellationToken
): Promise<string | undefined> {
  const model = vscode.workspace.getConfiguration().get<string>(`${CFG}.openai.model`, 'gpt-4o-mini');
  const key = await ctx.secrets.get(SECRET_KEY_OPENAI);
  if (!key) return undefined;

  try {
    const https = require('https');

    return await new Promise<string | undefined>((resolve) => {
      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: Math.ceil(maxOut / 2)
      });

      const options = {
        method: 'POST',
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const text = json?.choices?.[0]?.message?.content as string | undefined;
            resolve(text);
          } catch {
            resolve(undefined);
          }
        });
      });

      req.on('error', () => resolve(undefined));
      req.write(body);
      req.end();

      token.onCancellationRequested(() => {
        try { req.destroy(); } catch {}
        resolve(undefined);
      });
    });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return undefined;
  }
}

// === DeepSeek 回退路径（使用 SecretStorage 保存 key） ===
async function tryDeepSeek(
  ctx: vscode.ExtensionContext,
  prompt: string,
  maxOut: number,
  temperature: number,
  token: vscode.CancellationToken
): Promise<string | undefined> {
  const model = vscode.workspace.getConfiguration().get<string>(`${CFG}.deepseek.model`, 'deepseek-chat');
  const key = await ctx.secrets.get(SECRET_KEY_DEEPSEEK);
  if (!key) return undefined;

  try {
    const https = require('https');

    return await new Promise<string | undefined>((resolve) => {
      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: Math.ceil(maxOut / 2)
      });

      const options = {
        method: 'POST',
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const text = json?.choices?.[0]?.message?.content as string | undefined;
            resolve(text);
          } catch {
            resolve(undefined);
          }
        });
      });

      req.on('error', () => resolve(undefined));
      req.write(body);
      req.end();

      token.onCancellationRequested(() => {
        try { req.destroy(); } catch {}
        resolve(undefined);
      });
    });
  } catch (error) {
    console.error('DeepSeek API error:', error);
    return undefined;
  }
}

// === Ollama 本地回退 ===
async function tryOllama(
  prompt: string,
  maxOut: number,
  token: vscode.CancellationToken
): Promise<string | undefined> {
  const model = vscode.workspace.getConfiguration().get<string>(`${CFG}.ollama.model`, 'qwen2.5:7b');

  try {
    // 使用 Node.js 内置的 http 模块
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ model, prompt, stream: false });
      
      const options = {
        hostname: '127.0.0.1',
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData.response);
          } catch (error) {
            resolve(undefined);
          }
        });
      });

      req.on('error', () => {
        resolve(undefined);
      });

      req.write(postData);
      req.end();

      // 监听取消请求
      token.onCancellationRequested(() => {
        req.destroy();
        resolve(undefined);
      });
    });
  } catch (error) {
    console.error('Ollama API error:', error);
    return undefined;
  }
}

function sanitizePlainText(s: string): string {
  // 去掉围栏与多余空行
  return s.replace(/```[\s\S]*?```/g, '').replace(/(^\s+|\s+$)/g, '').replace(/\n{3,}/g, '\n\n');
}

export function deactivate() {}

// 负责在 quickMode === 'menu' 时，使用 VS Code 建议小框体展示候选并处理选择
class CategoryCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {
    // 如果处于类别选择模式，先展示类别项
    if (quickMode === 'category') {
      const categories = [
        { key: '1', label: '形容词 (Adjectives)', command: 'aiComplete.quickAdj' },
        { key: '2', label: '名词 (Nouns)', command: 'aiComplete.quickNoun' },
        { key: '3', label: '动词 (Verbs)', command: 'aiComplete.quickVerb' },
        { key: '4', label: '修辞 (Rhetoric)', command: 'aiComplete.quickRhetoric' },
        { key: '5', label: '其他 (Custom)', command: 'aiComplete.quickCustom' }
      ];
      const items = categories.map((c, idx) => {
        const item = new vscode.CompletionItem(`${c.key}) ${c.label}`, vscode.CompletionItemKind.Keyword);
        item.command = { command: c.command, title: c.label };
        // 不插入任何文本，仅执行命令
        item.insertText = new vscode.SnippetString('');
        item.range = new vscode.Range(position, position);
        return item;
      });
      return new vscode.CompletionList(items, false);
    }

    // 候选模式：展示之前生成的候选项
    if (quickMode === 'menu' && quickCandidates.length > 0) {
      const items = quickCandidates.map((text, idx) => {
        const item = new vscode.CompletionItem(`${idx + 1}) ${text}`, vscode.CompletionItemKind.Text);
        item.insertText = text;
        item.range = new vscode.Range(position, position);
        return item;
      });
      return new vscode.CompletionList(items, false);
    }

    return undefined;
  }
}

async function showCategoryCandidates(ctx: vscode.ExtensionContext, digit: '1'|'2'|'3'|'4') {
  const editor = vscode.window.activeTextEditor; if (!editor) return;
  const document = editor.document;
  const position = editor.selection.active;
  const providerPref = vscode.workspace.getConfiguration().get<string>(`${CFG}.provider`, 'auto');
  const maxCtx = vscode.workspace.getConfiguration().get<number>(`${CFG}.maxCharsContext`, 2000);
  const temperature = 0.7 + ((gVariantNonce % 5) * 0.05);
  const prompt = buildCategoryPrompt(document, position, maxCtx, digit);
  const raw = await requestFromModels(ctx, providerPref, prompt, 400, temperature);
  if (!raw) return;
  const candidates = parseCandidateList(raw).slice(0, 20);
  if (candidates.length === 0) return;
  quickCandidates = candidates;
  quickMode = 'menu';
  await vscode.commands.executeCommand('editor.action.triggerSuggest');
}

async function showCustomInfill(ctx: vscode.ExtensionContext, requirement: string) {
  const editor = vscode.window.activeTextEditor; if (!editor) return;
  const document = editor.document;
  const position = editor.selection.active;
  const providerPref = vscode.workspace.getConfiguration().get<string>(`${CFG}.provider`, 'auto');
  const maxCtx = vscode.workspace.getConfiguration().get<number>(`${CFG}.maxCharsContext`, 2000);
  const temperature = 0.7 + ((gVariantNonce % 5) * 0.05);
  const prompt = buildCustomInfillingPrompt(document, position, maxCtx, requirement);
  const text = await requestFromModels(ctx, providerPref, prompt, 200, temperature);
  const insertion = sanitizePlainText(text || '').trim();
  if (!insertion) return;
  await editor.edit((eb) => eb.insert(position, insertion));
}
