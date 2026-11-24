"""녹화 영상(webm) + 장면별 TTS 음성(aiff)을 timeline.json 시각에 맞춰 합쳐 1920x1080 MP4로 만든다."""
import json, subprocess, sys, os

D = os.path.dirname(os.path.abspath(__file__))
tl = json.load(open(f"{D}/timeline.json"))
raw = open(f"{D}/raw_path.txt").read().strip()
out = sys.argv[1] if len(sys.argv) > 1 else f"{D}/yeosin-sasu-demo.mp4"

cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", raw]
for t in tl["timeline"]:
    cmd += ["-i", f"{D}/{t['id']}.wav"]
parts = []
for i, t in enumerate(tl["timeline"], start=1):
    ms = int(t["start"] * 1000)
    parts.append(f"[{i}:a]aresample=48000,adelay={ms}|{ms}[a{i}]")
mix = "".join(f"[a{i}]" for i in range(1, len(tl["timeline"]) + 1))
parts.append(f"{mix}amix=inputs={len(tl['timeline'])}:normalize=0,alimiter=limit=0.85:level=0[aout]")
parts.append("[0:v]fps=30,scale=1920:1080:flags=lanczos,format=yuv420p[vout]")
cmd += ["-filter_complex", ";".join(parts), "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]
subprocess.run(cmd, check=True)
dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], capture_output=True, text=True).stdout.strip()
print("ok", out, f"{float(dur):.1f}s")
