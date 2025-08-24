# AI Complete (Writing Inline)

一个智能的VS Code写作补全扩展，支持多种AI模型，为Markdown和纯文本文件提供智能续写功能。

## 功能特性

- 🚀 **智能续写**: 基于上下文自动续写文本，保持语言风格一致
- 🔄 **多模型支持**: 优先使用VS Code Language Model API，回退到OpenAI或Ollama
- 📝 **专注写作**: 专为Markdown和纯文本文件优化
- ⚙️ **灵活配置**: 可调节上下文长度、补全字符数等参数
- 🔒 **安全存储**: API密钥使用VS Code Secret Storage安全保存

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

### 配置选项

在VS Code设置中搜索"AI Complete"可以配置以下选项：

- `aiComplete.enabled`: 开启/关闭写作补全
- `aiComplete.provider`: 选择模型来源（lm/openai/deepseek/ollama/auto）
- `aiComplete.openai.model`: OpenAI模型名称
- `aiComplete.deepseek.model`: DeepSeek模型名称
- `aiComplete.ollama.model`: Ollama本地模型名称
- `aiComplete.maxCharsContext`: 上下文最大字符数
- `aiComplete.maxSuggestionChars`: 单次补全最大字符数

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

## 许可证

MIT License
