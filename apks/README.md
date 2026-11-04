# Ready-to-install APKs — UAE Lab Vision AI

| File | App | Notes |
|------|-----|--------|
| **UAE-Lab-Expert.apk** | Call receiver (Expert Engineer) | Included in this folder (~26 MB) |
| **UAE-Lab-Vision-AI.apk** | Main glasses / phone AI app | Published on [GitHub Releases](https://github.com/shaiksultan/VisionClaw/releases) (~156 MB; over git’s 100 MB file limit) |

## Install

```powershell
adb install -r UAE-Lab-Vision-AI.apk
adb install -r UAE-Lab-Expert.apk
```

Or copy the APK onto the phone and open it (enable Install unknown apps if prompted).

## Configure

1. Both phones and the PC on the same Wi‑Fi.  
2. Mission Control running: `http://YOUR_PC_IP:8090`  
3. In **Lab Expert**, set the base URL to that Mission Control address.  
4. In **UAE Lab Vision AI**, Settings / Secrets must point at the same PC IP (and Gemini key for AI).

Full guide: [DEMO_INSTALL_AND_USE.md](../DEMO_INSTALL_AND_USE.md)
