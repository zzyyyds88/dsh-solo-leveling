#!/usr/bin/env python3
"""
synth-voice.py —— 用 edge-tts 合成 DeepSeek 桌宠台词（晓伊音色，完全离线内嵌）

设计原则（许可干净）：
  - 台词文本为**本项目原创**（DeepSeek 桌宠风格），不复制 dsh-whale-pet 的任何文本/音频；
  - edge-tts 仅作为本地合成工具，产物 mp3 以 base64 内嵌进 src/client/voice.generated.js，
    client bundle 完全离线播放，不依赖网络/系统 TTS；
  - 用法：python3 scripts/synth-voice.py   （需要 pip install edge-tts，见 README）

输出：src/client/voice.generated.js —— 导出 VOICES = { key: { text, b64 } }
"""
import asyncio
import base64
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "src", "client", "voice.generated.js")

# 音色：晓伊（中文女声，温柔）。可用 --voice 覆盖，如 zh-CN-YunxiNeural（男声）
VOICE = os.environ.get("PET_VOICE", "zh-CN-XiaoyiNeural")
RATE = os.environ.get("PET_RATE", "+0%")

# 台词表（key → 文本）。全部为 DeepSeek 桌宠原创台词，每类多条便于随机。
LINES = {
    # 任务完成
    "done1": "任务完成啦！",
    "done2": "搞定，真棒！",
    "done3": "耶，又完成一个！",
    "done4": "收工，干得漂亮！",
    "done5": "搞定啦，快夸夸我！",
    "done6": "完成，效率超高！",
    # 出错安慰
    "error1": "出错了，别担心。",
    "error2": "我重新试一次。",
    "error3": "工具不听话，我换个办法。",
    "error4": "哎呀，这次没弄好。",
    "error5": "别急，我再想想办法。",
    # 戳一戳
    "poke1": "别戳我啦！",
    "poke2": "嘿嘿，好痒呀。",
    "poke3": "我在认真干活呢。",
    "poke4": "再戳我就罢工啦！",
    "poke5": "好啦好啦，我在的。",
    # 摸头
    "headpat1": "被摸头了，好开心。",
    "headpat2": "嘿嘿，最喜欢主人了。",
    "headpat3": "摸头摸够了，继续干活！",
    # 等待批准
    "approval1": "需要主人同意一下。",
    "approval2": "我在等你的批准哦。",
    "approval3": "主人确认一下，我就继续。",
    # 提问 / 反问
    "question1": "主人，请回答我的问题。",
    "question2": "主人，需要你做个选择。",
    "question3": "这题需要主人拿主意。",
    # 问候
    "morning": "早上好，新的一天。",
    "noon": "中午好，别忘了吃饭。",
    "afternoon": "下午好，继续加油。",
    "night": "晚上好，今天也辛苦啦。",
    # 静音 / 恢复
    "muted": "声音已关闭。",
    "unmuted": "声音已开启。",
    # 忙碌
    "busy1": "好多任务，我有点忙。",
    "busy2": "正在处理多个会话。",
    "busy3": "忙完这个就来陪你。",
    # 思考中
    "thinking": "让我想一想。",
    "thinking2": "嗯，我在琢磨呢。",
    "thinking3": "这个问题有点意思。",
}

async def synth_one(key: str, text: str) -> dict:
    import edge_tts
    communicate = edge_tts.Communicate(text, voice=VOICE, rate=RATE)
    buf = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.extend(chunk["data"])
    b64 = base64.b64encode(bytes(buf)).decode("ascii")
    print(f"  [{key}] {len(buf):>6} bytes  {text}")
    return {"text": text, "b64": b64}

async def main():
    print(f"合成 {len(LINES)} 条台词（音色 {VOICE}，语速 {RATE}）…")
    voices = {}
    for key, text in LINES.items():
        try:
            voices[key] = await synth_one(key, text)
        except Exception as exc:  # noqa: BLE001 —— 单条失败不中断整体
            print(f"  [{key}] 失败：{exc}", file=sys.stderr)
    body = "export const VOICES = " + json.dumps(voices, ensure_ascii=False) + "\n"
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(body)
    size = os.path.getsize(OUT)
    print(f"\n已写入 {OUT}（{size} 字节，{len(voices)}/{len(LINES)} 条）")

if __name__ == "__main__":
    asyncio.run(main())
