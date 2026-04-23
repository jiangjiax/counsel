# Future: Xilem for Native GUI

## Date Added
2026-04-12

## Why Xilem?
- Pure Rust native GUI framework (no WebView/Electron)
- High performance + declarative + type-safe
- GPU-accelerated rendering via Vello
- MVU (Model-View-Update) architecture

## When to Consider
- When we want animated avatars/characters
- When we need speech synthesis visualization
- When we want native Rust UI instead of HTML/CSS
- For embedded GUI applications

## Current Status
**Experimental** - Not ready for production use yet.

## Reference
- Article: https://mp.weixin.qq.com/s/EaoCM0EfLiD8tM9HL_mB_g
- GitHub: https://github.com/linebender/xilem
- Compare with: Iced, Druid, Tauri

## Decision
For now, use **Tauri** if we need native packaging with existing HTML/CSS UI.
Xilem can be revisited when:
1. It reaches stable v1.0
2. We have dedicated resources for Rust GUI development
3. We need performance-critical UI (animations, real-time graphics)
