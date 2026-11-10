"""Export the isolated browser recording as an MP4 and validate decoding."""
import json
import os
from pathlib import Path
import subprocess

folder = Path(__file__).resolve().parent
encoder = next((Path(os.environ['TEMP']) / 'codex-video-tools/imageio_ffmpeg/binaries').glob('*.exe'))
metadata = json.loads((folder / 'recording.json').read_text())
source = max(folder.glob('*.webm'), key=lambda path: path.stat().st_mtime)
target = folder / 'site-reports-demo.mp4'
subprocess.run([
    str(encoder), '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', str(metadata['trimStart']), '-i', str(source),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', str(target)
], check=True)
subprocess.run([str(encoder), '-v', 'error', '-i', str(target), '-f', 'null', '-'], check=True)
for second in (18, 26, 38):
    subprocess.run([
        str(encoder), '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', str(second), '-i', str(target), '-frames:v', '1',
        str(folder / f'check-{second}.png')
    ], check=True)
print(json.dumps({'file': str(target), 'bytes': target.stat().st_size, 'pageErrors': metadata['errors']}))
