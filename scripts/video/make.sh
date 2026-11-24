#!/usr/bin/env bash
# 데모 영상 제작(v2): 사람이 녹음한 장면별 음성 + 애니메이션 슬라이드 + 재생 모드 화면 녹화(Liner 사용 지점 라벨·자막) → 1920x1080 MP4.
# 준비
#  1) 녹음: docs/submission/VOICE_SCRIPT.md의 장면별 문장을 S00.wav … S10.wav(S06a·b·c 포함, 13개)로 한 폴더에
#  2) 다른 터미널에서 재생 모드 서버(Liner 호출 없음):
#     LOANDESK_DEMO_REPLAY=1 LOANDESK_DEMO_ASOF=2026-11-23 NEXT_PUBLIC_BETA=0 npm run dev
# 사용: scripts/video/make.sh <음성 폴더> <작업 폴더>   → <작업 폴더>/yeosin-sasu-demo.mp4
# 녹화 중 크롬 창이 약 5분 떴다 사라진다. 필요: ffmpeg, 크롬.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$SRC/../.." && pwd)"
A="${1:?음성 폴더}"; W="${2:?작업 폴더}"; mkdir -p "$W"
cp "$SRC"/record.mjs "$SRC"/compose.py "$W"/
for id in S00 S01 S02 S03 S04 S05 S06a S06b S06c S07 S08 S09 S10; do cp "$A/$id.wav" "$W/"; done
cd "$W"
[ -d node_modules/playwright ] || { npm init -y >/dev/null; npm i --silent playwright@1.57.0; }
python3 -I - "$ROOT/docs/submission/VOICE_SCRIPT.md" <<'PY'
import json,subprocess,sys
lines=[l[2:].strip() for l in open(sys.argv[1],encoding="utf-8") if l.startswith("> ") and not l.startswith("> 기업")]
ids=["S00","S01","S02","S03","S04","S05","S06a","S06b","S06c","S07","S08","S09","S10"]
assert len(lines)==13, len(lines)
if lines[12].startswith("사수는"): lines[12]="여신 "+lines[12]
N=[{"id":i,"text":t,"dur":round(float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"{i}.wav"],capture_output=True,text=True).stdout),2)} for i,t in zip(ids,lines)]
# S06a는 두 문장을 화면 동작에 따로 맞추기 위해 가운데 쉼에서 둘로 나눈다(S06a1·S06a2)
import re
out=subprocess.run(["ffmpeg","-hide_banner","-i","S06a.wav","-af","silencedetect=noise=-35dB:d=0.25","-f","null","-"],capture_output=True,text=True).stderr
st=[float(x) for x in re.findall(r"silence_start: ([0-9.]+)",out)]; en=[float(x) for x in re.findall(r"silence_end: ([0-9.]+)",out)]
d=[n for n in N if n["id"]=="S06a"][0]["dur"]
mids=[(e-s,(s+e)/2) for s,e in zip(st,en) if 0.5<s<d-0.5]
cut=max(mids)[1]
subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i","S06a.wav","-t",f"{cut:.2f}","-c:a","pcm_s16le","S06a1.wav"],check=True)
subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i","S06a.wav","-af",f"atrim=start={cut:.2f},asetpts=PTS-STARTPTS","-c:a","pcm_s16le","S06a2.wav"],check=True)
t=[n for n in N if n["id"]=="S06a"][0]["text"]; s1,s2=t.split(". ",1)
N+= [{"id":"S06a1","text":s1+".","dur":round(cut,2)},{"id":"S06a2","text":s2,"dur":round(d-cut,2)}]
# 문장 시작 시각: 글자 수 비율로 추정한 뒤, 실제 녹음에서 쉬었다가 다시 말하기 시작하는 지점(±2초 안)으로 맞춘다.
# (녹음마다 쉬는 길이가 달라 비율만 쓰면 화면 강조·자막이 1초 넘게 어긋날 수 있다)
for n in N:
    parts=[x for x in re.split(r"(?<=[.?!])\s+",n["text"]) if x]
    tot=sum(len(x) for x in parts) or 1
    out=subprocess.run(["ffmpeg","-hide_banner","-i",f'{n["id"]}.wav',"-af","silencedetect=noise=-40dB:d=0.25","-f","null","-"],capture_output=True,text=True).stderr
    ends=[float(x) for x in re.findall(r"silence_end: ([0-9.]+)",out)]
    starts=[0.0]; acc=0
    for x in parts[:-1]:
        acc+=len(x); est=acc/tot*n["dur"]
        near=[e for e in ends if abs(e-est)<=2.0 and e>starts[-1]+0.5 and e<n["dur"]-0.3]
        starts.append(round(min(near,key=lambda e:abs(e-est)),2) if near else round(est,2))
    n["starts"]=starts
json.dump(N,open("narration.json","w"),ensure_ascii=False,indent=1)
PY
rm -rf raw timeline.json raw_path.txt
node record.mjs
python3 -I compose.py yeosin-sasu-demo.mp4
