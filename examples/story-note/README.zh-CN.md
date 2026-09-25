# Story Note / 叙事便签

[English](README.md) · **简体中文**

最小的官方 hook 示例，供开发者复制并改写。仅向 `outputKind: story` 的系统提示词追加一句“给玩家留出决定下一步的空间”的英文建议。不会重写生成结果，不读写 store、不发起网络请求、不直接调用模型；增加少量输入 token。

## 安装与演示

在支持 GitHub 安装的 Covel 中粘贴：

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/story-note
```

本地开发也可把此目录复制到用户插件目录的 `example-story-note/`。重启后在会话中启用并批准服务端代码。在叙事 runtime 的上下文 trace 中可以看到末尾的建议，非 story runtime 的上下文保持不变。

插件默认不启用；即便是官方示例也需要社区代码授权，安装确认不代替执行授权。适配 Covel 0.0.39 的公共 hook 契约。

在此插件目录中运行：

```sh
node --test tests/*.test.js
```

MIT，参见同目录 [LICENSE](LICENSE)。
