"""Camadas do Reel montado (1080x1920), desenhadas com o mesmo motor do carrossel.

Para cada cena saem: o fundo (JPEG em 2x, para o ffmpeg dar o movimento sem serrilhar), a camada
fixa (arroba, logo, assinatura), a camada do título (entra com animação) e uma camada por trecho
de legenda. O ffmpeg só empilha e anima: todo texto nasce aqui, com as mesmas garantias da arte
(quebra de linha, corpo mínimo, contraste medido no pixel, caractere que a fonte não tem).

ÁREA SEGURA DO REELS: o aplicativo cobre o topo (conta, câmera), a base (legenda, áudio) e a
lateral direita (curtir, comentar). Nenhum texto nosso sai da faixa entre 14% do topo e 35% da
base, com 6% de folga nas laterais.
"""
import os
from PIL import Image, ImageDraw
from .layout import Tela, Pilha, SS, mix, hexa, encaixar, ErroLayout
from .modelos import BRANCO, rotulo, filete, acao

RW, RH = 1080, 1920
TOPO, BASE, LADO = 270, 1248, 80
SEGURA_REEL = (64, TOPO, 64, RH - BASE)
Y_ARROBA = 334            # linha de base do cabeçalho
Y_TIT0, Y_TIT1 = 400, 880  # faixa do título
Y_LEG0, Y_LEG1 = 920, 1160  # faixa da legenda
Y_ASSIN = 1226            # linha de base da assinatura
VEUS = (0.55, 0.68, 0.8, 0.88)


def _cobrir(im, larg, alt):
    f = max(larg / im.width, alt / im.height)
    im = im.resize((max(larg, round(im.width * f)), max(alt, round(im.height * f))), Image.LANCZOS)
    x, y = (im.width - larg) // 2, (im.height - alt) // 2
    return im.crop((x, y, x + larg, y + alt))


def _fundo(tm, cena, k, veu):
    """Devolve (base RGB em 2x, escuro?, cor de referência ou None, gravar?)."""
    f = cena.get('fundo') or {}
    tam = (RW * SS, RH * SS)
    if f.get('tipo') == 'foto':
        im = _cobrir(Image.open(f['arquivo']).convert('RGB'), *tam)
        return Image.blend(im, Image.new('RGB', tam, tm.escuro), veu), True, None, True
    if f.get('tipo') == 'video':
        # o vídeo passa por baixo de um véu da cor da marca; o contraste é conferido no pior caso (quadro branco)
        return Image.new('RGB', tam, mix(BRANCO, tm.escuro, veu)), True, None, False
    escuro = cena['tipo'] in ('capa', 'cta')
    cor = tm.escuro if escuro else (tm.claro if k % 2 else tm.apoio)
    base = Image.new('RGB', tam, cor)
    d = ImageDraw.Draw(base)
    tom = mix(cor, tm.claro if escuro else tm.escuro, 0.11 if escuro else 0.07)
    cx, cy = (RW - 40, 520) if k % 2 else (40, 1500)
    for r in (620, 450, 280):
        d.ellipse([round(v * SS) for v in (cx - r, cy - r, cx + r, cy + r)], outline=tom, width=2 * SS)
    return base, escuro, tom, True


def _cena(tm, kit, cena, k, n, saida, veu):
    base, escuro, tom, gravar = _fundo(tm, cena, k, veu)
    nome = lambda s: os.path.join(saida, f'cena_{k:02d}_{s}')
    fundo_ref = tom if tom is not None else mix(BRANCO, tm.escuro, veu)
    tinta = tm.claro if escuro else tm.escuro
    suave = tm.suave(fundo_ref) if tom is not None else tm.claro
    # sobre foto ou vídeo o destaque da marca não garante leitura: o chapéu e o filete usam a tinta clara
    dest = tm.destaque(fundo_ref) if tom is not None else tm.claro
    larg = RW - 2 * LADO
    out = {'tipo': cena['tipo'], 'veu': None}
    if gravar:
        out['fundo'] = nome('fundo.jpg')
        base.save(out['fundo'], quality=90)
    else:
        out['fundo'] = None
        out['veu'] = {'cor': hexa(tm.escuro), 'alfa': veu}

    def tela():
        return Tela(None, RW, RH, SEGURA_REEL, base=base)

    # camada fixa: arroba, logo e assinatura (nome, profissão e registro vão em toda peça)
    t = tela()
    t.espacado(kit['arroba'], tm.f_corpo(600), 32, LADO, Y_ARROBA, suave, esp=0.6, nome='arroba', larg_max=larg - 240)
    if kit.get('logo'):
        t.colar(kit['logo'], RW - LADO, Y_ARROBA - 12, 220, 76)
    else:
        t.espacado(f'{k:02d} / {n:02d}', tm.f_corpo(600), 30, RW - LADO, Y_ARROBA, suave, esp=2, nome='página', alinh='dir')
    t.espacado(kit['assinatura'], tm.f_corpo(500), 28, LADO, Y_ASSIN, suave, esp=0.4, nome='assinatura', larg_max=larg)
    out['fixo'] = {'arquivo': nome('fixo.png'), 'caixa': t.salvar_recorte(nome('fixo.png'))}

    # título (com chapéu, filete e, na última cena, a chamada)
    t = tela()
    p = Pilha(t, larg)
    if cena.get('kicker'):
        p.fixo(34, rotulo(cena['kicker'], tm.f_corpo(700), 32, dest, nome='chapéu'), gap=40)
    p.texto(cena['titulo'], tm.tit(128, 72, 1.06), tinta, dest, 'título', gap=40)
    p.fixo(4, filete(dest, comp=140, esp=4), gap=44)
    if cena.get('acao'):
        p.fixo(104, acao(cena['acao'], tm, None if escuro else tm.escuro, tm.claro, borda=dest if escuro else None))
    else:
        p.itens[-1]['gap'] = 0
    h = p.resolver(Y_TIT1 - Y_TIT0)
    p.desenhar(LADO, Y_TIT0 + (Y_TIT1 - Y_TIT0 - h) * 0.4)
    out['titulo'] = {'arquivo': nome('titulo.png'), 'caixa': t.salvar_recorte(nome('titulo.png'))}

    # legendas: uma pílula por trecho, sempre no mesmo lugar
    out['legendas'] = []
    caixa, texto = (tm.claro, tm.escuro) if escuro else (tm.escuro, tm.claro)
    for j, trecho in enumerate(cena.get('legendas') or [], 1):
        t = tela()
        est = tm.corpo(50, 38, 1.26, 700)
        est.max_linhas = 2
        est.balancear = True      # duas linhas de tamanho parecido, sem palavra sozinha embaixo
        padh, padv = 40, 28
        b = encaixar(trecho, est, larg - 2 * padh)
        w, alt = b.larg + 2 * padh, b.alt + 2 * padv
        x0, y0 = (RW - w) / 2, Y_LEG0 + (Y_LEG1 - Y_LEG0 - alt) / 2
        t.ret(x0, y0, x0 + w, y0 + alt, caixa + (255,), raio=30)
        t.bloco(b, x0 + padh, y0 + padv, texto, None, f'legenda {j}', 'centro', b.larg)
        arq = nome(f'leg_{j:02d}.png')
        out['legendas'].append({'arquivo': arq, 'caixa': t.salvar_recorte(arq), 'texto': trecho})
    return out


def camadas_reel(kit, tm, cenas, saida):
    os.makedirs(saida, exist_ok=True)
    n, out = len(cenas), []
    for k, cena in enumerate(cenas, 1):
        ultimo = None
        for veu in VEUS:           # foto ou vídeo claros demais: escurece o véu até o texto ficar legível
            try:
                out.append(_cena(tm, kit, cena, k, n, saida, veu))
                ultimo = None
                break
            except ErroLayout as e:
                ultimo = e
                if (cena.get('fundo') or {}).get('tipo') not in ('foto', 'video') or 'contraste' not in str(e):
                    break
        if ultimo:
            raise type(ultimo)(f'cena {k}: {ultimo}')
    return out
