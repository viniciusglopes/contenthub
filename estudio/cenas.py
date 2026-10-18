#!/usr/bin/env python3
"""REEL COM CENAS: vídeo de fundo em movimento + legenda palavra a palavra (motor "render2").

Chamado pelo ContentHub como processo filho: UM JSON na entrada padrão, UM JSON na saída padrão.
O andamento sai na saída de erro, uma linha por vez: "PROGRESSO <feito> <total>".

  {"op": "tts", "voz": {"voice", "rate", "pitch"}, "falas": ["..."], "saida": "/pasta", "fake": false}
      Narração com marcas de palavra (edge-tts WordBoundary). Uma fala por cartão. Sem rede ou com a
      Microsoft recusando: {"ok": false, "tipo": "Voz", "erro": "..."}; NÃO existe voz reserva.
      "fake": true (só testes) gera um tom com marcas de palavra sintéticas, sem rede.

  {"op": "render", "look": {...}, "cards": [...], "falas": [{"mp3", "words"}], "clips": [{"path", "dur"}],
   "corte": 3.4, "saida": "/arq.mp4", "quadros": "/pasta" | null}
      look  = tema completo (cores, fontes, legenda, gancho, escurecimento, zoom, trilha). Quem monta é o
              ContentHub a partir do Padrão de vídeo e do kit de marca (src/lib/studio/cenas.ts).
      cards = [{"voice", "blocks": [{"style", "text"}], "mode": "card" | "karaoke"}]; *palavra* = destaque.
      clips = cenas da biblioteca, já sorteadas e na ordem de uso (cicla quando acabam).

Portado de /root/viral_canais/_build/render2.py (aprovado em 18/10/2026). Não abre rede no render e não
lê nada fora dos caminhos recebidos.
"""
import asyncio
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import time

RAIZ = os.path.dirname(os.path.abspath(__file__))
if os.path.isdir(os.path.join(RAIZ, 'pylib')):
    sys.path.insert(0, os.path.join(RAIZ, 'pylib'))

import numpy as np                                   # noqa: E402
from PIL import Image, ImageDraw, ImageFont          # noqa: E402

FONTS = os.path.join(RAIZ, 'fontes')
W, H, FPS = 1080, 1920, 30
CAP_MAXW = 860
CAP_CY = 1120          # centro da legenda (acima da UI de baixo do Reels/TikTok)
SAFE_X0, SAFE_X1 = 96, 960
SAFE_Y0, SAFE_Y1 = 300, 1400


class ErroVoz(Exception):
    pass


def progresso(feito, total):
    sys.stderr.write(f'PROGRESSO {feito} {total}\n')
    sys.stderr.flush()


# ---------------------------------------------------------------- texto (motor v1)
_FONT_CACHE = {}


def font(path, size, var=None):
    key = (path, size, var)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    if os.path.basename(path) != path:
        raise ValueError('fonte inválida')
    f = ImageFont.truetype(os.path.join(FONTS, path), size)
    if var:
        try:
            f.set_variation_by_name(var)
        except Exception:
            pass
    _FONT_CACHE[key] = f
    return f


def tokens(text):
    """'a *b c* d' -> [(word, hl)]"""
    out, hl = [], False
    for part in re.split(r'(\*)', text):
        if part == '*':
            hl = not hl
            continue
        for w in part.split():
            out.append((w, hl))
    return out


def wrap(toks, f, maxw):
    lines, cur = [], []
    sp = f.getlength(' ')
    for w, hl in toks:
        test = cur + [(w, hl)]
        width = sum(f.getlength(x) for x, _ in test) + sp * (len(test) - 1)
        if cur and width > maxw:
            lines.append(cur)
            cur = [(w, hl)]
        else:
            cur = test
    if cur:
        lines.append(cur)
    return lines


def layout_block(block, theme, maxw):
    st = theme['styles'][block.get('style', 'body')]
    size = st['size']
    while True:
        f = font(st['font'], size, st.get('var'))
        toks = tokens(block['text'].upper() if st.get('upper') else block['text'])
        lines = wrap(toks, f, maxw)
        widest = max(sum(f.getlength(w) for w, _ in ln) + f.getlength(' ') * (len(ln) - 1) for ln in lines)
        if widest <= maxw or size < 30:
            break
        size -= 4
    lh = int(size * st.get('lh', 1.18))
    return dict(f=f, lines=lines, lh=lh, st=st, h=lh * len(lines), size=size)


def scale_theme(theme, s):
    t = dict(theme)
    t['styles'] = {k: dict(v, size=max(28, int(v['size'] * s))) for k, v in theme['styles'].items()}
    return t


def render_card(card, theme):
    maxw = SAFE_X1 - SAFE_X0
    blocks = card['blocks']
    scale = 1.0
    for _ in range(12):
        lays = [layout_block(dict(b), scale_theme(theme, scale), maxw) for b in blocks]
        gaps = [int(theme.get('gap', 46) * scale)] * (len(lays) - 1)
        total = sum(lay['h'] for lay in lays) + sum(gaps)
        if total <= SAFE_Y1 - SAFE_Y0:
            break
        scale *= 0.92
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = SAFE_Y0 + (SAFE_Y1 - SAFE_Y0 - total) // 2 + int(card.get('dy', 0))
    for i, lay in enumerate(lays):
        st, f = lay['st'], lay['f']
        sp = f.getlength(' ')
        for ln in lay['lines']:
            lw = sum(f.getlength(w) for w, _ in ln) + sp * (len(ln) - 1)
            x = (W - lw) / 2 if st.get('align', 'center') == 'center' else SAFE_X0
            for w, hl in ln:
                col = tuple(st['hl'] if hl else st['color'])
                if st.get('shadow'):
                    d.text((x + 3, y + 4), w, font=f, fill=(0, 0, 0, 170))
                d.text((x, y), w, font=f, fill=col)
                x += f.getlength(w) + sp
            y += lay['lh']
        if i < len(gaps):
            y += gaps[i]
    return img


def dur(p):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).strip())


# ---------------------------------------------------------------- voz
async def _edge(voice, rate, pitch, text, mp3):
    import edge_tts
    com = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary='WordBoundary')
    words = []
    with open(mp3, 'wb') as f:
        async for ch in com.stream():
            if ch['type'] == 'audio':
                f.write(ch['data'])
            elif ch['type'] == 'WordBoundary':
                s = ch['offset'] / 1e7
                words.append({'w': ch['text'], 's': round(s, 3), 'e': round(s + ch['duration'] / 1e7, 3)})
    return words


def _fake_tts(text, mp3):
    ws = text.split()
    words, t = [], 0.05
    for w in ws:
        d = 0.12 + 0.045 * len(w)
        words.append({'w': re.sub(r'[^\w]', '', w) or w, 's': round(t, 3), 'e': round(t + d, 3)})
        t += d + 0.06
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', f'sine=frequency=220:duration={t + 0.1:.2f}', '-ar', '24000', '-ac', '1', '-b:a', '48k', mp3], check=True)
    return words


def op_tts(p):
    v = p['voz']
    os.makedirs(p['saida'], exist_ok=True)
    out = []
    if p.get('fake') == 'falha':  # só testes: o serviço de voz recusando
        raise ErroVoz('WSServerHandshakeError: 403, message=Invalid response status (simulado)')
    for i, text in enumerate(p['falas']):
        mp3 = os.path.join(p['saida'], f'voz_{i}.mp3')
        if p.get('fake'):
            words = _fake_tts(text, mp3)
        else:
            erro = ''
            words = None
            for tent in range(3):
                try:
                    words = asyncio.run(_edge(v['voice'], v.get('rate', '+0%'), v.get('pitch', '+0Hz'), text, mp3))
                    if os.path.getsize(mp3) > 1000 and words:
                        break
                    erro = 'a voz voltou vazia'
                except Exception as e:  # rede, 403 da Microsoft, voz inexistente
                    erro = f'{type(e).__name__}: {str(e)[:200]}'
                words = None
                time.sleep(1.5 * (tent + 1))
            if not words:
                raise ErroVoz(erro or 'sem resposta')
        out.append({'mp3': mp3, 'words': words, 'dur': round(dur(mp3), 3)})
        progresso(i + 1, len(p['falas']))
    return {'falas': out}


# ---------------------------------------------------------------- legenda palavra a palavra
def norm(w):
    return re.sub(r'[^\wáéíóúâêôãõàçñü]', '', w.lower())


def align(text, words):
    """Casa as palavras do WordBoundary com os tokens do texto (recupera a pontuação)."""
    toks = text.split()
    out, j = [], 0
    for w in words:
        nw = norm(w['w'])
        disp = w['w']
        for k in range(j, min(j + 4, len(toks))):
            if norm(toks[k]).startswith(nw[:3]) or nw.startswith(norm(toks[k])[:3]):
                disp = toks[k]
                j = k + 1
                break
        out.append(dict(w, d=disp, end=bool(re.search(r'[.!?…]$', disp)), comma=bool(re.search(r'[,;:]$', disp))))
    return out


class Captioner:
    def __init__(self, theme):
        c = theme['cap']
        self.c = c
        self.f = font(c['font'], c['size'], c.get('var'))
        self.cache = {}

    def chunks(self, words):
        out, cur = [], []
        for w in words:
            cur.append(w)
            txt = ' '.join(x['d'] for x in cur)
            if self.c.get('upper'):
                txt = txt.upper()
            if len(cur) >= self.c.get('max_words', 3) or w['end'] or w['comma'] or self.f.getlength(txt) > CAP_MAXW * 1.5:
                out.append(cur)
                cur = []
        if cur:
            out.append(cur)
        return out

    def layer(self, chunk, active, emph):
        key = (tuple(x['d'] for x in chunk), active)
        if key in self.cache:
            return self.cache[key]
        c, f = self.c, self.f
        words = [x['d'].upper() if c.get('upper') else x['d'] for x in chunk]
        sp = f.getlength(' ')
        lines, cur = [], []
        for i, w in enumerate(words):
            test = cur + [i]
            if cur and sum(f.getlength(words[k]) for k in test) + sp * (len(test) - 1) > CAP_MAXW:
                lines.append(cur)
                cur = [i]
            else:
                cur = test
        lines.append(cur)
        lh = int(c['size'] * c.get('lh', 1.12))
        sw = c.get('stroke', 6)
        hgt = lh * len(lines) + 2 * sw + 40
        img = Image.new('RGBA', (W, hgt), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        y = 20
        for ln in lines:
            lw = sum(f.getlength(words[k]) for k in ln) + sp * (len(ln) - 1)
            x = (W - lw) / 2
            for k in ln:
                isact = k == active
                isemph = norm(chunk[k]['w']) in emph
                col = tuple(c['hl']) if (isact or (isemph and c.get('emph_always', True))) else tuple(c['color'])
                if isact and c.get('box'):
                    bw = f.getlength(words[k])
                    d.rounded_rectangle((x - 14, y - 4, x + bw + 14, y + lh - 6), radius=14, fill=tuple(c['box']))
                    col = tuple(c.get('box_text', c['color']))
                d.text((x + 2, y + 5), words[k], font=f, fill=(0, 0, 0, c.get('shadow_a', 150)))
                d.text((x, y), words[k], font=f, fill=col, stroke_width=sw, stroke_fill=tuple(c.get('stroke_col', (0, 0, 0))))
                x += f.getlength(words[k]) + sp
            y += lh
        if len(self.cache) > 400:
            self.cache.clear()
        self.cache[key] = img
        return img


def text_layer(text, st, maxw=860):
    f = font(st['font'], st['size'], st.get('var'))
    t = text.upper() if st.get('upper') else text
    while f.getlength(t) > maxw and f.size > 24:
        f = font(st['font'], f.size - 2, st.get('var'))
    lw = f.getlength(t)
    img = Image.new('RGBA', (W, int(f.size * 1.5) + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.text(((W - lw) / 2 + 2, 14), t, font=f, fill=(0, 0, 0, 160))
    d.text(((W - lw) / 2, 10), t, font=f, fill=tuple(st['color']), stroke_width=st.get('stroke', 0), stroke_fill=(0, 0, 0))
    return img


# ---------------------------------------------------------------- fundo
def shade(theme, strong=False):
    """Escurecimento geral + gradiente em cima/embaixo + tinta, num multiplicador HxWx3 já pronto."""
    g = theme.get('grade', {})
    y = np.linspace(0, 1, H)
    m = np.full(H, g.get('dim', 0.72))
    m *= 1 - g.get('top', 0.45) * np.clip(1 - y / 0.22, 0, 1) ** 1.5
    m *= 1 - g.get('bottom', 0.55) * np.clip((y - 0.5) / 0.5, 0, 1) ** 1.3
    if strong:
        m *= 0.72
    t = np.array(g.get('tint') or [1, 1, 1], dtype=np.float32).reshape(1, 1, 3)
    return (m.reshape(H, 1, 1).astype(np.float32) * t)


def clip_reader(clip, start, nframes):
    fx = clip.get('fx', 0.5)
    vf = (f"scale=w='if(gt(a,{W}/{H}),-2,{W})':h='if(gt(a,{W}/{H}),{H},-2)':flags=bicubic,"
          f"crop={W}:{H}:x='(iw-{W})*{fx}':y='(ih-{H})/2',fps={FPS},format=rgb24")
    cmd = ['ffmpeg', '-v', 'error', '-threads', '2', '-stream_loop', '-1', '-ss', f'{start:.2f}', '-i', clip['path'],
           '-frames:v', str(nframes), '-an', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stdin=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    last = None
    try:
        for _ in range(nframes):
            b = p.stdout.read(W * H * 3)
            if len(b) == W * H * 3:
                last = b
            if last is None:
                raise RuntimeError('cena sem quadros legíveis')
            yield last
    finally:
        p.stdout.close()
        p.kill()
        p.wait()


def zoom(img, k, z0, z1, pan):
    """Zoom lento contínuo (sem tremer: transformação afim em ponto flutuante)."""
    z = z0 + (z1 - z0) * k
    cx = W / 2 + pan * (k - 0.5) * W * (z - 1)
    cy = H / 2
    a = 1 / z
    return img.transform((W, H), Image.AFFINE, (a, 0, cx - a * W / 2, 0, a, cy - a * H / 2), resample=Image.BILINEAR)


def plan_segments(cards_t, words_all, seg_target):
    """Cortes: início de cada cartão + dentro dos longos a cada ~seg_target s, num início de palavra."""
    segs = []
    for ci, (s, d) in enumerate(cards_t):
        e = s + d
        starts = [w['S'] for w in words_all if w['card'] == ci]
        endsent = {w2['S'] for w1, w2 in zip(words_all, words_all[1:]) if w1['card'] == ci == w2['card'] and (w1['end'] or w1['comma'])}
        cuts = [s]
        n = max(1, round(d / seg_target))
        if ci == 0:
            n = 1
        for k in range(1, n):
            target = s + d * k / n
            cand = [x for x in starts if x - cuts[-1] > min(2.2, seg_target * 0.65) and e - x > min(2.2, seg_target * 0.65)]
            if not cand:
                continue
            best = min(cand, key=lambda x: abs(x - target) - (0.9 if x in endsent else 0))
            if best > cuts[-1]:
                cuts.append(best)
        cuts.append(e)
        for a, b in zip(cuts, cuts[1:]):
            segs.append((ci, a, b))
    return segs


def op_render(p):
    theme = p['look']
    cards = p['cards']
    falas = p['falas']
    clips = p['clips']
    seg_target = float(p.get('corte') or 3.4)
    out = p['saida']
    if not clips:
        raise ValueError('nenhuma cena')
    if len(falas) != len(cards):
        raise ValueError('uma fala por cartão')
    tmp = tempfile.mkdtemp(prefix='cenas_', dir=os.path.dirname(out))
    try:
        return _render(theme, cards, falas, clips, seg_target, out, p.get('quadros'), tmp)
    finally:
        subprocess.run(['rm', '-rf', tmp])


def _render(theme, cards, falas, clips, seg_target, out, quadros, tmp):
    ncards = len(cards)
    cards_t, wavs, words_all, card_imgs, modes = [], [], [], [], []
    t0 = 0.0
    for i, c in enumerate(cards):
        mp3 = falas[i]['mp3']
        words = align(c['voice'], falas[i]['words'])
        lead = 0.0 if i == 0 else 0.10
        tail = c.get('hold', 0.35 if i < ncards - 1 else 1.3)
        d = lead + dur(mp3) + tail
        if i == 0:
            d = max(d, c.get('min', 1.6))
        wav = f'{tmp}/v{i}.wav'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', mp3, '-af', f'adelay={int(lead*1000)}|{int(lead*1000)},apad,atrim=0:{d:.3f}',
                        '-ar', '44100', '-ac', '2', wav], check=True)
        wavs.append(wav)
        for w in words:
            words_all.append(dict(w, S=t0 + lead + w['s'], E=t0 + lead + w['e'], card=i))
        mode = c.get('mode', 'card' if i in (0, ncards - 1) else 'karaoke')
        modes.append(mode)
        if mode == 'card':
            th = theme
            if i > 0 and theme.get('card_boost'):  # cartão final (CTA) maior sobre vídeo
                th = dict(theme, styles={k: dict(v, size=int(v['size'] * theme['card_boost'].get(k, 1.0))) for k, v in theme['styles'].items()})
            card_imgs.append(render_card({'blocks': c['blocks'], 'dy': c.get('dy', 0)}, th))
        else:
            card_imgs.append(None)
        cards_t.append((t0, d))
        t0 += d
    total = t0

    # ---------------- áudio: voz normalizada + pad sintetizado (sem direito autoral)
    voice_cat, lst = f'{tmp}/voice.wav', f'{tmp}/l.txt'
    with open(lst, 'w') as fh:
        fh.write(''.join(f"file '{w}'\n" for w in wavs))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'pcm_s16le', voice_cat], check=True)
    audio = f'{tmp}/mix.m4a'
    pad_vol = float(theme.get('pad_vol', 0.35))
    if theme.get('music', True) and pad_vol > 0:
        chord = theme.get('pad', [110, 164.81, 220, 277.18])
        expr = '+'.join(f'0.03*sin(2*PI*{fr}*t)*(0.7+0.3*sin(2*PI*{0.07+0.03*k}*t))' for k, fr in enumerate(chord))
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', voice_cat,
                        '-f', 'lavfi', '-i', f"aevalsrc='{expr}|{expr}':s=44100:d={total:.3f}",
                        '-filter_complex', f"[1]lowpass=f=900,volume={pad_vol},afade=t=in:d=1.5,afade=t=out:st={max(0,total-1.5):.2f}:d=1.5[p];"
                        f"[0]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100[v];[v][p]amix=inputs=2:duration=first:normalize=0[a]",
                        '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', audio], check=True)
    else:
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', voice_cat, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100',
                        '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', audio], check=True)

    # ---------------- camadas fixas
    cap = Captioner(theme)
    emph, num_l, ref_l = {}, {}, {}
    for i, c in enumerate(cards):
        emph[i] = {norm(w) for w, hl in tokens(' '.join(b['text'] for b in c['blocks'])) if hl and len(norm(w)) >= 4}
        for b in c['blocks']:
            if b.get('style') == 'num' and modes[i] == 'karaoke':
                num_l[i] = text_layer(b['text'], dict(theme['styles']['num'], stroke=4, **theme.get('num_overlay', {})))
            if b.get('style') == 'ref' and modes[i] == 'karaoke':
                ref_l[i] = text_layer(b['text'], dict(theme['styles']['ref'], stroke=2))
    chunks = []
    for i in range(ncards):
        if modes[i] != 'karaoke':
            continue
        chs = cap.chunks([w for w in words_all if w['card'] == i])
        cend = cards_t[i][0] + cards_t[i][1]
        for k, ch in enumerate(chs):
            s = ch[0]['S'] - 0.06
            e = chs[k + 1][0]['S'] - 0.06 if k + 1 < len(chs) else cend
            chunks.append((s, e, i, ch))

    brand = Image.new('RGBA', (W, 300), (0, 0, 0, 0))
    b = theme['brand']
    if b.get('text'):
        bd = ImageDraw.Draw(brand)
        bf = font(b['font'], b['size'], b.get('var'))
        lw = bf.getlength(b['text'])
        bd.text(((W - lw) / 2 + 2, 202), b['text'], font=bf, fill=(0, 0, 0, 170))
        bd.text(((W - lw) / 2, 200), b['text'], font=bf, fill=tuple(b['color']))
        if b.get('rule'):
            bd.line(((W / 2 - 60), 250, (W / 2 + 60), 250), fill=tuple(b['color']), width=3)
    hnd = theme['handle']
    hl_img = Image.new('RGBA', (W, 60), (0, 0, 0, 0))
    if hnd.get('text'):
        hf = font(hnd['font'], hnd['size'], hnd.get('var'))
        hd = ImageDraw.Draw(hl_img)
        lw = hf.getlength(hnd['text'])
        hd.text(((W - lw) / 2, 6), hnd['text'], font=hf, fill=(225, 225, 225), stroke_width=2, stroke_fill=(0, 0, 0))

    mult = shade(theme)
    mult_strong = shade(theme, strong=True)

    # ---------------- cenas: cicla pela lista recebida (já sorteada), sem repetir enquanto houver
    segs = plan_segments(cards_t, words_all, seg_target)
    used, seg_clips = {}, []
    for si in range(len(segs)):
        ci = si % len(clips)
        clip = dict(clips[ci])
        n_used = used.get(ci, 0)
        used[ci] = n_used + 1
        cd = clip.get('dur') or dur(clip['path'])
        clip['start'] = (clip.get('in', 0.5) + n_used * 4.0) % max(1.0, cd - 3.5)
        seg_clips.append(clip)

    bar = tuple(theme.get('bar', (245, 197, 24)))
    enc = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                            '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'faster', '-crf', '21', '-threads', '2',
                            '-x264-params', 'rc-lookahead=20', '-maxrate', '9M', '-bufsize', '18M', '-g', '60',
                            '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'copy', '-movflags', '+faststart', '-shortest', out],
                           stdin=subprocess.PIPE)
    nframes = int(math.ceil(total * FPS))
    n = 0
    zdir = theme.get('zoom', [1.0, 1.08])
    for si, (ci, a, bb) in enumerate(segs):
        f0, f1 = int(round(a * FPS)), int(round(bb * FPS)) if si < len(segs) - 1 else nframes
        nf = max(1, f1 - f0)
        clip = seg_clips[si]
        z0, z1 = (zdir if si % 2 == 0 else zdir[::-1])
        pan = 0.6 if si % 3 == 0 else (-0.6 if si % 3 == 1 else 0)
        cmode = modes[ci]
        m = mult_strong if cmode == 'card' else mult
        for j, raw in enumerate(clip_reader(clip, clip['start'], nf)):
            t = (f0 + j) / FPS
            arr = np.frombuffer(raw, np.uint8).reshape(H, W, 3).astype(np.float32)
            arr *= m
            np.clip(arr, 0, 255, out=arr)
            img = Image.fromarray(arr.astype(np.uint8))
            img = zoom(img, j / max(1, nf - 1), z0, z1, pan).convert('RGBA')
            img.alpha_composite(brand, (0, 0))
            lt = t - cards_t[ci][0]
            if cmode == 'card':
                al = 1.0 if ci == 0 else min(1.0, lt / 0.2)
                layer = card_imgs[ci]
                if ci == 0 and lt < 0.25:  # gancho entra com "pop"
                    s = 0.86 + 0.14 * (1 - (1 - lt / 0.25) ** 3)
                    layer = layer.resize((int(W * s), int(H * s)), Image.BILINEAR)
                    off = ((W - layer.width) // 2, (H - layer.height) // 2)
                else:
                    off = (0, int((1 - al) * 24))
                if al < 1:
                    layer = layer.copy()
                    layer.putalpha(layer.getchannel('A').point(lambda v, al=al: int(v * al)))
                img.alpha_composite(layer, off)
            else:
                if ci in num_l:
                    img.alpha_composite(num_l[ci], (0, 440))
                cur = [x for x in chunks if x[0] <= t < x[1]]
                if cur:
                    s, e, cc, ch = cur[0]
                    act = None
                    for k, w in enumerate(ch):
                        if w['S'] - 0.04 <= t:
                            act = k
                    ly = cap.layer(ch, act, emph.get(cc, set()))
                    pt = t - s
                    if pt < 0.12:  # entrada rápida do bloco
                        sc = 0.9 + 0.1 * pt / 0.12
                        ly2 = ly.resize((int(ly.width * sc), int(ly.height * sc)), Image.BILINEAR)
                        img.alpha_composite(ly2, ((W - ly2.width) // 2, CAP_CY - ly2.height // 2))
                    else:
                        img.alpha_composite(ly, (0, CAP_CY - ly.height // 2))
                if ci in ref_l:
                    img.alpha_composite(ref_l[ci], (0, 1300))
            img.alpha_composite(hl_img, (0, 1450))
            dd = ImageDraw.Draw(img)
            dd.rectangle((0, 0, int(W * (t / total)), 7), fill=bar)
            enc.stdin.write(img.convert('RGB').tobytes())
            n += 1
            if n % 30 == 0:
                progresso(n, nframes)
    enc.stdin.close()
    if enc.wait() != 0:
        raise RuntimeError('o codificador de vídeo falhou')
    progresso(nframes, nframes)

    shots = []
    if quadros:
        os.makedirs(quadros, exist_ok=True)
        pts = [0.15, 1.0] + [(a + bb) / 2 for _, a, bb in segs] + [total - 0.5]
        for k, pt in enumerate(pts):
            f = os.path.join(quadros, f'q{k:02d}.png')
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{pt:.2f}', '-i', out, '-frames:v', '1', '-vf', 'scale=540:960', f], check=True)
            shots.append(f)
    return {'saida': out, 'dur': round(total, 2), 'cenas': len(segs), 'frames': n, 'clipes': [c['path'] for c in seg_clips], 'quadros': shots,
            'cortes': [round(a, 2) for _, a, _ in segs]}


def main():
    t0 = time.perf_counter()
    try:
        p = json.load(sys.stdin)
        if p['op'] == 'tts':
            out = op_tts(p)
        elif p['op'] == 'render':
            out = op_render(p)
        else:
            raise ValueError('operação desconhecida')
        out.update(ok=True, tempo_s=round(time.perf_counter() - t0, 2))
    except ErroVoz as e:
        out = {'ok': False, 'tipo': 'Voz', 'erro': str(e)[:300]}
    except Exception as e:
        out = {'ok': False, 'tipo': 'Interno', 'erro': f'{type(e).__name__}: {str(e)[:300]}'}
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
