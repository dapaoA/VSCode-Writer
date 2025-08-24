"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatPanelProvider = void 0;
const vscode = __importStar(require("vscode"));
const CFG = 'aiComplete';
const SECRET_KEY_OPENAI = 'aiComplete.openai.apiKey';
const SECRET_KEY_DEEPSEEK = 'aiComplete.deepseek.apiKey';
class ChatPanelProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    resolveWebviewView(webviewView) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        webviewView.webview.html = this.getHtml();
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg?.type === 'send') {
                const userText = String(msg.text || '').trim();
                if (!userText)
                    return;
                // Echo user
                webviewView.webview.postMessage({ type: 'append', who: 'user', text: userText });
                // Typing indicator id
                const msgId = String(Date.now());
                webviewView.webview.postMessage({ type: 'typing', id: msgId });
                const providerPref = vscode.workspace.getConfiguration().get(`${CFG}.provider`, 'auto');
                const temperature = 0.7;
                const maxOut = 400;
                let text = '';
                try {
                    const reply = await requestFromModels(webviewView, providerPref, userText, maxOut, temperature);
                    text = sanitizePlainText(reply || '').trim();
                    if (!text)
                        text = '(无可用回复)';
                }
                catch (e) {
                    text = '(生成失败)';
                }
                webviewView.webview.postMessage({ type: 'complete', id: msgId, text });
            }
            if (msg?.type === 'insert') {
                const text = String(msg.text || '');
                const editor = vscode.window.activeTextEditor;
                if (!editor || !text)
                    return;
                await editor.edit((eb) => eb.insert(editor.selection.active, text));
            }
            if (msg?.type === 'copy') {
                const text = String(msg.text || '');
                if (!text)
                    return;
                await vscode.env.clipboard.writeText(text);
                vscode.window.showInformationMessage('已复制到剪贴板');
            }
        });
    }
    getHtml() {
        const nonce = String(Date.now());
        return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 0; }
    .wrap { display: flex; flex-direction: column; height: 100vh; }
    .msgs { flex: 1; overflow: auto; padding: 8px; }
    .msg { margin: 8px 0; padding: 8px; border-radius: 6px; line-height: 1.5; white-space: pre-wrap; }
    .u { background: rgba(127,127,127,0.1); }
    .a { background: rgba(0,127,255,0.1); }
    .row { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--vscode-panel-border); }
    input[type=text] { flex: 1; padding: 6px 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
    button { padding: 6px 10px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; }
    .actions { margin-top: 6px; display: flex; gap: 6px; }
  </style>
  <title>AI Chat</title>
  </head>
<body>
  <div class="wrap">
    <div id="msgs" class="msgs"></div>
    <div class="row">
      <input id="ipt" type="text" placeholder="输入内容，回车发送" />
      <button id="send">发送</button>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const msgs = document.getElementById('msgs');
    const ipt = document.getElementById('ipt');
    const sendBtn = document.getElementById('send');

    function append(who, text){
      const div = document.createElement('div');
      div.className = 'msg ' + (who === 'assistant' ? 'a' : 'u');
      div.textContent = text;
      const actions = document.createElement('div');
      actions.className = 'actions';
      if (who === 'assistant') {
        const ins = document.createElement('button'); ins.textContent = '插入到光标';
        ins.onclick = () => vscode.postMessage({ type: 'insert', text });
        const cp = document.createElement('button'); cp.textContent = '复制';
        cp.onclick = () => vscode.postMessage({ type: 'copy', text });
        actions.appendChild(ins); actions.appendChild(cp);
      }
      div.appendChild(actions);
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }

    function appendTyping(id){
      const div = document.createElement('div');
      div.className = 'msg a';
      div.dataset.id = id;
      div.textContent = '…';
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }

    function completeTyping(id, text){
      const div = [...msgs.querySelectorAll('.msg.a')].find(d => d.dataset.id === id);
      if (!div) { append('assistant', text); return; }
      div.textContent = text;
      // actions
      const actions = document.createElement('div');
      actions.className = 'actions';
      const ins = document.createElement('button'); ins.textContent = '插入到光标';
      ins.onclick = () => vscode.postMessage({ type: 'insert', text });
      const cp = document.createElement('button'); cp.textContent = '复制';
      cp.onclick = () => vscode.postMessage({ type: 'copy', text });
      actions.appendChild(ins); actions.appendChild(cp);
      div.appendChild(actions);
      msgs.scrollTop = msgs.scrollHeight;
    }

    window.addEventListener('message', (e) => {
      const msg = e.data || {};
      if (msg.type === 'append') append(msg.who, msg.text);
      if (msg.type === 'typing') appendTyping(msg.id);
      if (msg.type === 'complete') completeTyping(msg.id, msg.text);
    });

    function send(){
      const v = ipt.value.trim(); if(!v) return;
      vscode.postMessage({ type: 'send', text: v });
      ipt.value = '';
    }
    sendBtn.onclick = send;
    ipt.addEventListener('keydown', (ev)=>{ if(ev.key === 'Enter'){ send(); }});
  </script>
</body>
</html>`;
    }
}
exports.ChatPanelProvider = ChatPanelProvider;
ChatPanelProvider.viewType = 'ai-complete-chat-panel';
function sanitizePlainText(s) {
    return s.replace(/```[\s\S]*?```/g, '').replace(/(^\s+|\s+$)/g, '').replace(/\n{3,}/g, '\n\n');
}
async function requestFromModels(webviewView, providerPref, prompt, maxOut, temperature) {
    // Try VS Code LM
    try {
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
        if (models && models.length) {
            const [model] = models;
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            const resp = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
            let text = '';
            for await (const frag of resp.text) {
                text += frag;
                if (text.length >= maxOut)
                    break;
            }
            if (text)
                return text;
        }
    }
    catch { }
    // Fallbacks
    if (providerPref === 'openai' || providerPref === 'auto') {
        const t = await tryOpenAI(prompt, maxOut, temperature);
        if (t)
            return t;
    }
    if (providerPref === 'deepseek' || providerPref === 'auto') {
        const t = await tryDeepSeek(prompt, maxOut, temperature);
        if (t)
            return t;
    }
    if (providerPref === 'ollama' || providerPref === 'auto') {
        const t = await tryOllama(prompt, maxOut);
        if (t)
            return t;
    }
    return undefined;
}
async function tryOpenAI(prompt, maxOut, temperature) {
    const cfg = vscode.workspace.getConfiguration();
    const model = cfg.get(`${CFG}.openai.model`, 'gpt-4o-mini');
    const key = await vscode.commands.executeCommand('workbench.action.getContextKeyInfo')
        .then(async () => await vscode.authentication.getSession('github', [], { createIfNone: false })) // noop to avoid TS unused
        .then(async () => await vscode.env.clipboard.readText()) // noop
        .then(async () => await vscode.workspace.getConfiguration().get(`${CFG}.openai.model`)) // noop
        .then(async () => undefined);
    const stored = await vscode.workspace.getConfiguration();
    // SecretStorage 只能在 extension.ts 里拿到 ctx，这里简化：尝试从全局密钥读取失败则返回 undefined
    // 为避免耦合，这里读取不到则不调用 OpenAI
    const keyFromSecret = await vscode.commands.executeCommand('aiComplete.getOpenAIKey');
    const apiKey = keyFromSecret;
    if (!apiKey)
        return undefined;
    const https = require('https');
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: Math.ceil(maxOut / 2) });
    const options = { method: 'POST', hostname: 'api.openai.com', path: '/v1/chat/completions', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } };
    return await new Promise(resolve => {
        const req = https.request(options, (res) => { let data = ''; res.on('data', (c) => data += c); res.on('end', () => { try {
            const j = JSON.parse(data);
            resolve(j?.choices?.[0]?.message?.content);
        }
        catch {
            resolve(undefined);
        } }); });
        req.on('error', () => resolve(undefined));
        req.write(body);
        req.end();
    });
}
async function tryDeepSeek(prompt, maxOut, temperature) {
    const cfg = vscode.workspace.getConfiguration();
    const model = cfg.get(`${CFG}.deepseek.model`, 'deepseek-chat');
    const keyFromSecret = await vscode.commands.executeCommand('aiComplete.getDeepSeekKey');
    const apiKey = keyFromSecret;
    if (!apiKey)
        return undefined;
    const https = require('https');
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: Math.ceil(maxOut / 2) });
    const options = { method: 'POST', hostname: 'api.deepseek.com', path: '/v1/chat/completions', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } };
    return await new Promise(resolve => {
        const req = https.request(options, (res) => { let data = ''; res.on('data', (c) => data += c); res.on('end', () => { try {
            const j = JSON.parse(data);
            resolve(j?.choices?.[0]?.message?.content);
        }
        catch {
            resolve(undefined);
        } }); });
        req.on('error', () => resolve(undefined));
        req.write(body);
        req.end();
    });
}
async function tryOllama(prompt, maxOut) {
    const cfg = vscode.workspace.getConfiguration();
    const model = cfg.get(`${CFG}.ollama.model`, 'qwen2.5:7b');
    const http = require('http');
    const postData = JSON.stringify({ model, prompt, stream: false });
    const options = { hostname: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } };
    return await new Promise(resolve => {
        const req = http.request(options, (res) => { let data = ''; res.on('data', (c) => data += c); res.on('end', () => { try {
            const j = JSON.parse(data);
            resolve(j?.response);
        }
        catch {
            resolve(undefined);
        } }); });
        req.on('error', () => resolve(undefined));
        req.write(postData);
        req.end();
    });
}
