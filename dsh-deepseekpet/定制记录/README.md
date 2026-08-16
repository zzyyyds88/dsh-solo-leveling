# deepseek-pet 定制记录 —— 说明

> 本文件夹记录 deepseek-pet 项目在**零改动收录**基础上的**功能增强移植**过程。

## 快速回顾

1. **收录**（git `2d87c83`）：从 [keleus/deepseek-pet](https://github.com/keleus/deepseek-pet)
   零改动收录，DSH `0.1.0-rc.6` API 逐项核对兼容（详见项目 README §5）。
2. **功能增强**（本次）：移植 [aceice01/dsh-whale-pet](https://github.com/aceice01/dsh-whale-pet)
   的 Web 端功能 —— 音效（WebAudio 合成）、离线语音（edge-tts 原创台词）、
   长按摸头、双击静音、三击诊断、纸屑庆祝、音量系统。

## 文件

- [变更记录.md](变更记录.md) —— 做了什么、为什么、怎么验证、怎么回退
- [本次diff.patch](本次diff.patch) —— 相对收录提交（`2d87c83`）的完整改动 diff
