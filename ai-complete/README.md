# AI Complete (Writing Inline)

作者：Simon Su

一个专注写作场景的 VS Code 智能补全扩展。支持 VS Code LM、OpenAI、DeepSeek、Ollama，多源回退，聚焦「短句续写」与「句中填补」。

## 功能特性

- 🚀 **智能续写（Continuation）**：在行尾基于上下文给出短句续写，保持原有风格与节奏
- ✍️ **句中填补（Infilling）**：光标在段落中时，提供最小必要插入（词/短语/短句），适配形容词/修辞/连接句等场景
- 🎛️ **候选词助手（Quick Suggest）**：一键在光标处弹出类别菜单（形容词/名词/动词/修辞/自定义），上下键选择即插入
- 🔁 **重新生成（Regenerate）**：对当前建议一键再生，自动做轻微温度扰动，提升多样性
- 🧩 **可控的填补策略**：支持关闭句中填补或仅手动触发，并限制句中填补最大长度，减少干扰
- 🔄 **多模型回退**：优先 VS Code LM，无则回退 OpenAI/DeepSeek/Ollama
- 📦 **Prompt 外置**：所有提示词集中在 `resources/prompt/prompts.json`，便于统一修改
- 🔒 **安全密钥**：API Key 存于 VS Code Secret Storage

## 安装

1. 克隆或下载此扩展
2. 在VS Code中按`Ctrl+Shift+P`，选择"Extensions: Install from VSIX..."
3. 选择扩展文件进行安装

## 使用方法

### 基本使用

1. 打开Markdown或纯文本文件
2. 开始输入文本
3. 当光标在行中间时，扩展会自动提供续写建议
4. 按`Tab`键接受建议，或继续输入忽略

### 命令

- `AI Complete: Set OpenAI API Key` - 设置OpenAI API密钥
- `AI Complete: Set DeepSeek API Key` - 设置DeepSeek API密钥
- `AI Complete: Enable/Disable` - 开启/关闭扩展
- `AI Complete: Quick Suggest` - 在光标处打开类别候选（形容词/名词/动词/修辞/自定义）
- `AI Complete: Regenerate Suggestion` - 重新生成当前建议

### 快捷键（默认）

- `Ctrl+Shift+K`：打开类别候选（在光标处的下拉小框体）
- `Ctrl+Alt+1/2/3/4/5`：直接生成 形容词/名词/动词/修辞/自定义 候选
- `Ctrl+Alt+G`：重新生成建议

### 配置选项

在VS Code设置中搜索"AI Complete"可以配置以下选项：

- `aiComplete.enabled`: 开启/关闭写作补全
- `aiComplete.provider`: 选择模型来源（lm/openai/deepseek/ollama/auto）
- `aiComplete.openai.model`: OpenAI模型名称
- `aiComplete.deepseek.model`: DeepSeek模型名称
- `aiComplete.ollama.model`: Ollama本地模型名称
- `aiComplete.maxCharsContext`: 上下文最大字符数
- `aiComplete.maxSuggestionChars`: 单次补全最大字符数
- `aiComplete.infill.enabled`：是否启用句中填补
- `aiComplete.infill.mode`：句中填补触发模式（auto/manualOnly）
- `aiComplete.infill.maxChars`：句中填补最大字符数（默认 40）

## 模型配置

### VS Code Language Model API
- 默认启用，无需额外配置
- 使用Copilot的GPT-4o-mini模型

### OpenAI
1. 运行命令"AI Complete: Set OpenAI API Key"
2. 输入你的OpenAI API密钥
3. 密钥会安全保存在VS Code Secret Storage中

### DeepSeek
1. 运行命令"AI Complete: Set DeepSeek API Key"
2. 输入你的DeepSeek API密钥
3. 密钥会安全保存在VS Code Secret Storage中

### Ollama
1. 确保本地运行Ollama服务（默认端口11434）
2. 安装并运行你想要的模型（如`qwen2.5:7b`）
3. 在设置中选择provider为"ollama"

## Prompt 管理

所有提示词集中在：

```
ai-complete/resources/prompt/prompts.json
```

支持占位符：`{{maxOut}}`、`{{requirement}}`、`{{type}}`。修改后无需改动代码。

## 开发

### 构建

```bash
npm install
npm run compile
```

### 打包

```bash
npm run package
```

### 调试

1. 按`F5`启动调试会话
2. 在新窗口中测试扩展功能

## 注意事项

- 扩展仅在Markdown和纯文本文件中工作
- 建议在行中间使用，避免在空行或行首触发
- 上下文长度建议保持在2000字符以内以获得最佳性能
- 补全字符数建议不超过140字符，适合短句续写
- 打开 Quick Suggest 时，自动暂停行内续写，避免视觉干扰

## 许可证

MIT License
