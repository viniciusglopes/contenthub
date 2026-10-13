"""Três modelos visuais, todos parametrizados pela paleta e pelas fontes do kit de marca.

  editorial          tipográfico, capa escura, afirmação em serifa + selo (bom para mito/verdade)
  pergunta_resposta  painel escuro com a pergunta, resposta no claro
  lista_numerada     cartão com número grande e barra de progresso

Cada função recebe (slide, tema, ctx) e devolve uma Tela pronta para salvar.
ctx = {'i': posição, 'n': total, 'arroba': '@...', 'assinatura': 'Nome · Profissão · Registro'}
"""
import os
from .layout import (W, H, MARGEM, Tela, Pilha, Estilo, Fonte, rgb, mix, contraste, luminancia,
                     cor_legivel, hexa, ErroLayout)

BRANCO = (255, 255, 255)
BASE_RODAPE = H - MARGEM - 6     # linha de base do rodapé
BASE_TOPO = 110                  # linha de base do cabeçalho


class Tema:
    def __init__(self, kit, raiz):
        p = kit['paleta']
        self.claro, self.escuro, self.dest_puro, self.apoio = (rgb(p[k]) for k in ('fundo', 'texto', 'destaque', 'apoio'))
        if contraste(self.escuro, self.claro) < 7:
            raise ErroLayout(f'paleta do kit: texto {p["texto"]} sobre fundo {p["fundo"]} tem contraste '
                             f'{contraste(self.escuro, self.claro):.2f} (mínimo 7 para o par principal)')
        f = kit['fontes']
        cam = lambda a: a if os.path.isabs(a) else os.path.join(raiz, a)
        self._tit, self._ita = cam(f['titulo']['arquivo']), cam(f['titulo'].get('italico') or f['titulo']['arquivo'])
        self._corpo = cam(f['corpo']['arquivo'])
        self.peso_tit = f['titulo'].get('peso', 600)
        self.peso_corpo = f['corpo'].get('peso', 500)
        self.ajustes = {}

    def tinta(self, fundo):
        return self.escuro if luminancia(fundo) > 0.4 else self.claro

    def _leg(self, nome, cor, fundo, minimo):
        c, mudou = cor_legivel(cor, fundo, minimo)
        if mudou:
            self.ajustes[f'{nome} sobre {hexa(fundo)}'] = f'{hexa(cor)} virou {hexa(c)} para atingir {minimo}:1'
        return c

    def destaque(self, fundo, minimo=4.5):
        return self._leg('destaque', self.dest_puro, fundo, minimo)

    def suave(self, fundo):
        """Texto secundário: a tinta principal amaciada, sem perder o AA."""
        return self._leg('texto secundário', mix(self.tinta(fundo), fundo, 0.28), fundo, 4.5)

    def tit(self, tam_max, tam_min, lh=1.02, peso=None, max_linhas=None, justo=False):
        p = peso or self.peso_tit
        return Estilo(Fonte(self._tit, p), tam_max, tam_min, lh, Fonte(self._ita, p), max_linhas, True, justo)

    def corpo(self, tam_max, tam_min, lh=1.44, peso=None):
        return Estilo(Fonte(self._corpo, peso or self.peso_corpo), tam_max, tam_min, lh)

    def f_corpo(self, peso):
        return Fonte(self._corpo, peso)

    def f_tit(self, peso, italico=False):
        return Fonte(self._ita if italico else self._tit, peso)


# ---------- peças comuns ----------
def cabecalho(t, tm, fundo, ctx, pagina=True):
    cor = tm.suave(fundo)
    t.espacado(ctx['arroba'], tm.f_corpo(600), 28, MARGEM, BASE_TOPO, cor, esp=0.6, nome='arroba')
    if pagina:
        t.espacado(f'{ctx["i"]:02d} / {ctx["n"]:02d}', tm.f_corpo(600), 28, W - MARGEM, BASE_TOPO, cor, esp=2,
                   nome='página', alinh='dir')


def rodape(t, tm, fundo, ctx, chamada='ARRASTE'):
    cor = tm.suave(fundo)
    ultimo = ctx['i'] == ctx['n']
    larg_max = (W - 2 * MARGEM) if ultimo else (W - 2 * MARGEM - 250)
    t.espacado(ctx['assinatura'], tm.f_corpo(500), 27, MARGEM, BASE_RODAPE, cor, esp=0.4, nome='assinatura', larg_max=larg_max)
    if not ultimo and chamada:
        d = tm.destaque(t.cor_em(W - MARGEM - 100, BASE_RODAPE - 10))   # o canto pode ter outro fundo
        t.seta(W - MARGEM - 56, BASE_RODAPE - 10, 56, d)
        t.espacado(chamada, tm.f_corpo(700), 26, W - MARGEM - 76, BASE_RODAPE, d, esp=4, nome='arraste', alinh='dir')


def rotulo(texto, fonte, tam, cor, esp=5, nome='rótulo', alinh='esq'):
    """Elemento de pilha: linha em caixa alta com letras espaçadas."""
    def fn(t, x, y, larg):
        xx = x if alinh == 'esq' else x + larg / 2
        t.espacado(texto.upper(), fonte, tam, xx, y + tam * 0.76, cor, esp=esp, nome=nome, alinh=alinh, larg_max=larg)
    return fn


def filete(cor, comp=120, esp=3, alinh='esq'):
    def fn(t, x, y, larg):
        c = larg if comp is None else comp
        x0 = x if alinh == 'esq' else x + (larg - c) / 2
        t.ret(x0, y, x0 + c, y + esp, cor)
    return fn


def selo(texto, tm, fundo, cheio):
    """Etiqueta em pílula (MITO / VERDADE)."""
    def fn(t, x, y, larg):
        f = tm.f_corpo(800)
        lw = t.medir_espacado(texto.upper(), f, 28, 5)
        if cheio:
            t.ret(x, y, x + lw + 64, y + 64, tm.escuro, raio=32)
            cor = tm.claro
        else:
            cor = tm.destaque(fundo)
            t.ret(x, y, x + lw + 64, y + 64, None, raio=32, borda=cor, esp=2.5)
        t.espacado(texto.upper(), f, 28, x + 32, y + 42, cor, esp=5, nome='selo')
    return fn


def acao(texto, tm, cor_caixa, cor_texto, borda=None, alinh='esq'):
    """Caixa da chamada final. Altura fixa de 104 px; o texto reduz se precisar."""
    def fn(t, x, y, larg):
        f = tm.f_corpo(700)
        tam = 34
        while t.medir_espacado(texto, f, tam, 0.4) > larg - 72 and tam > 27:
            tam -= 1
        lw = t.medir_espacado(texto, f, tam, 0.4)
        cw = larg if alinh == 'esq' else min(larg, lw + 96)
        x0 = x if alinh == 'esq' else x + (larg - cw) / 2
        t.ret(x0, y, x0 + cw, y + 104, cor_caixa, raio=52 if alinh == 'centro' else 20, borda=borda, esp=2.5)
        xt = x0 + 36 if alinh == 'esq' else x0 + (cw - lw) / 2
        t.espacado(texto, f, tam, xt, y + 52 + tam * 0.35, cor_texto, esp=0.4, nome='chamada', larg_max=cw - 72)
    return fn


def _ocupacao(t, usado, disp):
    t.ocupacao = round(usado / disp, 2)


# ---------- 1. EDITORIAL ----------
def editorial(s, tm, ctx):
    tipo = s['tipo']
    larg = W - 2 * MARGEM
    if tipo in ('capa', 'cta'):
        fundo = tm.escuro
        t = Tela(fundo)
        tom = mix(fundo, tm.claro, 0.11)
        cx, cy = (W - 30, 330) if tipo == 'capa' else (30, H - 330)
        for r in (470, 330, 190):
            t.anel(cx, cy, r, tom, 2)
        cabecalho(t, tm, tom, ctx, pagina=tipo != 'capa')
        d = tm.destaque(tom)       # pior caso: texto passando por cima de um anel
        p = Pilha(t, larg)
        if s.get('kicker'):
            p.fixo(30, rotulo(s['kicker'], tm.f_corpo(700), 28, d, nome='chapéu'), gap=46)
        if tipo == 'capa':
            p.texto(s['titulo'], tm.tit(138, 78, 1.08), tm.claro, d, 'título', gap=52)
        else:
            p.texto(s['titulo'], tm.tit(118, 68, 1.08), tm.claro, d, 'título', gap=48)
        p.fixo(3, filete(d), gap=46)
        if s.get('texto'):
            p.texto(s['texto'], tm.corpo(44, 34), mix(tm.claro, fundo, 0.14), None, 'apoio', gap=56)
        if tipo == 'cta' and s.get('acao'):
            p.fixo(104, acao(s['acao'], tm, None, tm.claro, borda=d), gap=0)
        else:
            p.itens[-1]['gap'] = 0
        topo, base = 180, H - 200
        h = p.resolver(base - topo)
        p.desenhar(MARGEM, base - h if tipo == 'capa' else topo + (base - topo - h) * 0.5)
        _ocupacao(t, h, base - topo)
        rodape(t, tm, tom, ctx, 'ARRASTE')
        return t

    fundo = tm.claro
    t = Tela(fundo)
    cabecalho(t, tm, fundo, ctx)
    t.linha(MARGEM, 146, W - MARGEM, 146, mix(fundo, tm.escuro, 0.16), 1.5)
    d = tm.destaque(fundo)
    p = Pilha(t, larg)
    if s.get('selo'):
        p.fixo(64, selo(s['selo'], tm, fundo, s.get('selo_tom', 'cheio') == 'cheio'), gap=50)
    p.texto(s['titulo'], tm.tit(108, 62, 1.08), tm.escuro, d, 'título', gap=42)
    p.fixo(3, filete(d), gap=42)
    p.texto(s['texto'], tm.corpo(46, 34), tm.escuro, None, 'texto')
    topo, base = 200, H - 190
    h = p.resolver(base - topo)
    y0 = topo + (base - topo - h) * 0.32
    # número do item na linha do selo, à direita: enfeite
    t.glifo(f'{ctx["i"] - 1:02d}', tm.f_tit(400, True), 150, W - MARGEM, y0 + 62, mix(fundo, tm.escuro, 0.16), 'rs')
    p.desenhar(MARGEM, y0)
    _ocupacao(t, h, base - topo)
    rodape(t, tm, fundo, ctx)
    return t


# ---------- 2. PERGUNTA E RESPOSTA ----------
def pergunta_resposta(s, tm, ctx):
    tipo = s['tipo']
    larg = W - 2 * MARGEM
    if tipo == 'capa':
        fundo = tm.apoio
        t = Tela(fundo)
        t.glifo('?', tm.f_tit(500, True), 1050, W + 120, 1040, mix(fundo, tm.escuro, 0.075), 'rs')
        cabecalho(t, tm, fundo, ctx, pagina=False)
        d = tm.destaque(fundo)
        larg = 780
        p = Pilha(t, larg)
        if s.get('kicker'):
            p.fixo(30, rotulo(s['kicker'], tm.f_corpo(700), 28, d, nome='chapéu'), gap=46)
        p.texto(s['titulo'], tm.tit(124, 74, 1.08), tm.escuro, d, 'título', gap=48)
        if s.get('texto'):
            p.texto(s['texto'], tm.corpo(44, 34), tm.escuro, None, 'apoio', gap=60)
        p.fixo(96, _botao(s.get('acao') or 'Arraste para ver as respostas', tm))
        topo, base = 190, H - 200
        h = p.resolver(base - topo)
        p.desenhar(MARGEM, topo + (base - topo - h) * 0.5)
        _ocupacao(t, h, base - topo)
        rodape(t, tm, fundo, ctx, None)
        return t

    if tipo == 'cta':
        fundo = tm.claro
        t = Tela(fundo)
        cabecalho(t, tm, fundo, ctx)
        pad = 64
        x0, x1 = MARGEM - 16, W - MARGEM + 16
        li = x1 - x0 - 2 * pad
        d = tm.destaque(tm.escuro)
        p = Pilha(t, li)
        p.texto(s['titulo'], tm.tit(112, 66, 1.08), tm.claro, d, 'título', gap=44)
        p.fixo(3, filete(d), gap=44)
        p.texto(s['texto'], tm.corpo(44, 34), mix(tm.claro, tm.escuro, 0.14), None, 'texto', gap=56)
        if s.get('acao'):
            p.fixo(104, acao(s['acao'], tm, tm.claro, tm.escuro))
        else:
            p.itens[-1]['gap'] = 0
        topo, base = 180, H - 190
        h = p.resolver(base - topo - 2 * pad)
        y0 = topo + (base - topo - h - 2 * pad) * 0.45
        t.ret(x0, y0, x1, y0 + h + 2 * pad, tm.escuro, raio=36)
        t.ret(x0 + pad, y0, x0 + pad + 120, y0 + 8, tm.destaque(tm.escuro, 3.0))
        p.desenhar(x0 + pad, y0 + pad)
        _ocupacao(t, h + 2 * pad, base - topo)
        rodape(t, tm, fundo, ctx)
        return t

    fundo = tm.claro
    t = Tela(fundo)
    de = tm.destaque(tm.escuro)
    pq = Pilha(t, larg)
    pq.fixo(30, rotulo(s.get('selo') or f'Dúvida {ctx["i"] - 1:02d}', tm.f_corpo(700), 28, de, nome='chapéu'), gap=36)
    pq.texto(s['titulo'], tm.tit(100, 60, 1.08), tm.claro, de, 'pergunta')
    hq = pq.resolver(470)
    painel = max(520, 190 + hq + 84)
    t.ret(0, 0, W, painel, tm.escuro)
    t.glifo('?', tm.f_tit(500, True), 560, W + 20, painel + 60, mix(tm.escuro, tm.claro, 0.07), 'rs')
    t.ret(0, painel, W, H, fundo)                      # corta o enfeite na borda do painel
    t.ret(MARGEM, painel - 4, MARGEM + 120, painel + 4, tm.destaque(tm.escuro, 3.0))
    cabecalho(t, tm, tm.escuro, ctx)
    pq.desenhar(MARGEM, painel - 84 - hq)
    d = tm.destaque(fundo)
    pa = Pilha(t, larg)
    pa.fixo(30, rotulo('Resposta', tm.f_corpo(700), 28, d, nome='rótulo resposta'), gap=34)
    pa.texto(s['texto'], tm.corpo(48, 34), tm.escuro, None, 'resposta')
    topo, base = painel + 76, H - 190
    ha = pa.resolver(base - topo)
    pa.desenhar(MARGEM, topo + (base - topo - ha) * 0.3)
    _ocupacao(t, ha, base - topo)
    rodape(t, tm, fundo, ctx)
    return t


def _botao(texto, tm):
    def fn(t, x, y, larg):
        f = tm.f_corpo(700)
        tx = texto.upper()
        lw = t.medir_espacado(tx, f, 26, 3.5)
        cw = min(larg, lw + 170)
        t.ret(x, y, x + cw, y + 96, tm.escuro, raio=48)
        t.espacado(tx, f, 26, x + 44, y + 57, tm.claro, esp=3.5, nome='botão', larg_max=larg - 170)
        t.seta(x + cw - 100, y + 48, 56, tm.claro)
    return fn


# ---------- 3. LISTA NUMERADA ----------
def lista_numerada(s, tm, ctx):
    tipo = s['tipo']
    if tipo == 'capa':
        fundo = tm.claro
        t = Tela(fundo)
        faixa = 320
        t.ret(W - faixa, 0, W, H, tm.apoio)
        itens = ctx['n'] - 2
        for k in range(itens):                        # marcas da lista, enfeite
            y = 250 + k * 64
            t.ret(W - faixa + 60, y, W - MARGEM, y + 4, mix(tm.apoio, tm.escuro, 0.75 if k == 0 else 0.22))
        cabecalho(t, tm, fundo, ctx, pagina=False)
        d = tm.destaque(fundo)
        larg = W - MARGEM - faixa - 50
        p = Pilha(t, larg)
        if s.get('kicker'):
            p.fixo(30, rotulo(s['kicker'], tm.f_corpo(700), 28, d, nome='chapéu'), gap=30)
        if s.get('numero_destaque'):
            p.texto(str(s['numero_destaque']), tm.tit(380, 240, 0.8, 500, justo=True), tm.destaque(fundo, 3.0), None, 'número', gap=40)
        p.texto(s['titulo'], tm.tit(104, 62, 1.08), tm.escuro, d, 'título', gap=44)
        p.fixo(3, filete(d), gap=42)
        if s.get('texto'):
            p.texto(s['texto'], tm.corpo(42, 34), tm.escuro, None, 'apoio')
        else:
            p.itens[-1]['gap'] = 0
        topo, base = 190, H - 190
        h = p.resolver(base - topo)
        p.desenhar(MARGEM, topo + (base - topo - h) * 0.5)
        _ocupacao(t, h, base - topo)
        rodape(t, tm, fundo, ctx, 'ARRASTE')
        return t

    if tipo == 'cta':
        fundo = tm.escuro
        t = Tela(fundo)
        tom = mix(fundo, tm.claro, 0.11)
        for r in (560, 420, 280):
            t.anel(W / 2, H / 2 - 40, r, tom, 2)
        cabecalho(t, tm, tom, ctx)
        d = tm.destaque(tom)
        larg = W - 2 * MARGEM - 60
        p = Pilha(t, larg)
        if s.get('kicker'):
            p.fixo(30, rotulo(s['kicker'], tm.f_corpo(700), 28, d, nome='chapéu', alinh='centro'), gap=44)
        p.texto(s['titulo'], tm.tit(116, 66, 1.08), tm.claro, d, 'título', gap=44, alinh='centro')
        p.fixo(3, filete(d, alinh='centro'), gap=44)
        p.texto(s['texto'], tm.corpo(44, 34), mix(tm.claro, fundo, 0.14), None, 'texto', gap=60, alinh='centro')
        if s.get('acao'):
            p.fixo(104, acao(s['acao'], tm, tm.claro, tm.escuro, alinh='centro'))
        else:
            p.itens[-1]['gap'] = 0
        topo, base = 180, H - 190
        h = p.resolver(base - topo)
        p.desenhar(MARGEM + 30, topo + (base - topo - h) * 0.5)
        _ocupacao(t, h, base - topo)
        rodape(t, tm, tom, ctx)
        return t

    fundo = tm.apoio
    cartao = mix(tm.claro, BRANCO, 0.55)
    t = Tela(fundo)
    cabecalho(t, tm, fundo, ctx)
    pad = 66
    x0, x1 = MARGEM - 20, W - MARGEM + 20
    larg = x1 - x0 - 2 * pad
    d = tm.destaque(cartao)
    p = Pilha(t, larg)
    p.texto(f'{ctx["i"] - 1:02d}', tm.tit(200, 130, 0.8, 500, justo=True), tm.destaque(cartao, 3.0), None, 'número', gap=40)
    p.fixo(2, filete(mix(cartao, tm.escuro, 0.2), comp=None, esp=2), gap=44)
    p.texto(s['titulo'], tm.tit(86, 54, 1.08, 700), tm.escuro, d, 'título', gap=32)
    p.texto(s['texto'], tm.corpo(44, 34), tm.escuro, None, 'texto')
    topo, base = 170, H - 270
    h = p.resolver(base - topo - 2 * pad)
    y0 = topo + (base - topo - h - 2 * pad) * 0.5
    t.ret(x0 + 10, y0 + 14, x1 + 10, y0 + h + 2 * pad + 14, mix(fundo, tm.escuro, 0.10), raio=36)   # sombra seca
    t.ret(x0, y0, x1, y0 + h + 2 * pad, cartao, raio=36)
    p.desenhar(x0 + pad, y0 + pad)
    _ocupacao(t, h + 2 * pad, base - topo)
    # progresso
    itens, atual = ctx['n'] - 2, ctx['i'] - 2
    seg = (W - 2 * MARGEM - 12 * (itens - 1)) / itens
    for k in range(itens):
        xa = MARGEM + k * (seg + 12)
        t.ret(xa, H - 218, xa + seg, H - 210, tm.escuro if k <= atual else mix(fundo, tm.escuro, 0.2), raio=4)
    rodape(t, tm, fundo, ctx)
    return t


MODELOS = {'editorial': editorial, 'pergunta_resposta': pergunta_resposta, 'lista_numerada': lista_numerada}
