"""Motor de layout do gerador de carrossel (Pillow puro, sem navegador).

Garantias, todas por cálculo e com falha explícita:
- quebra de linha automática e redução de corpo até um mínimo (TextoNaoCabe se não couber);
- nenhum texto fora da margem de segurança nem sobreposto a outro texto (ErroLayout);
- contraste WCAG AA medido contra os pixels REAIS que estão atrás de cada linha
  (ContrasteInsuficiente);
- todo caractere precisa existir na fonte (GlifoAusente), para não sair quadradinho.

Coordenadas sempre em unidades de 1080x1350. Desenha em 2x e reduz no fim.
"""
from dataclasses import dataclass, field
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
SS = 2                 # superamostragem
MARGEM = 80            # margem de composição
SEGURA = 64            # margem mínima conferida (nenhum texto pode passar daqui)

# O slide de 1080 px aparece com ~390 px CSS de largura no celular (fator ~0,36).
# "Texto grande" da WCAG (24 px, ou 18,66 px em negrito) equivale, na arte, a ~66 px (52 px negrito).
GRANDE_NORMAL, GRANDE_NEGRITO = 66, 52
AA_NORMAL, AA_GRANDE = 4.5, 3.0
CORPO_MINIMO = 26      # nada de texto menor que isso na arte (~9,4 px no celular)


class ErroLayout(Exception):
    pass


class TextoNaoCabe(ErroLayout):
    pass


class ContrasteInsuficiente(ErroLayout):
    pass


class GlifoAusente(ErroLayout):
    pass


# ---------- cor ----------
def rgb(h):
    if isinstance(h, (tuple, list)):
        return tuple(h)
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def hexa(c):
    return '#%02X%02X%02X' % tuple(c)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def luminancia(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def contraste(a, b):
    la, lb = luminancia(a), luminancia(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def cor_legivel(cor, fundo, minimo=AA_NORMAL):
    """Devolve (cor, ajustada?). Escurece ou clareia a cor até passar no contraste pedido."""
    if contraste(cor, fundo) >= minimo:
        return cor, False
    alvo = (0, 0, 0) if luminancia(fundo) > 0.4 else (255, 255, 255)
    for k in range(1, 41):
        c = mix(cor, alvo, k / 40)
        if contraste(c, fundo) >= minimo:
            return c, True
    raise ContrasteInsuficiente(f'não há tom de {hexa(cor)} legível sobre {hexa(fundo)}')


def exigido(tam, peso):
    grande = tam >= GRANDE_NORMAL or (tam >= GRANDE_NEGRITO and peso >= 700)
    return AA_GRANDE if grande else AA_NORMAL


# ---------- fonte ----------
@dataclass(frozen=True)
class Fonte:
    arquivo: str
    peso: int = 400


@lru_cache(maxsize=None)
def _ft(arquivo, peso, px):
    f = ImageFont.truetype(arquivo, px)
    try:
        f.set_variation_by_axes([peso])
    except Exception:
        pass  # fonte estática: usa o arquivo como está
    return f


def ft(fonte, tam):
    return _ft(fonte.arquivo, fonte.peso, round(tam * SS))


@lru_cache(maxsize=None)
def _tem_glifo(arquivo, peso, ch):
    f = _ft(arquivo, peso, 40)
    vazio = bytes(f.getmask('\U0010FFFF'))
    return bytes(f.getmask(ch)) != vazio


def conferir_glifos(texto, fonte):
    faltam = sorted({ch for ch in texto if not ch.isspace() and not _tem_glifo(fonte.arquivo, fonte.peso, ch)})
    if faltam:
        raise GlifoAusente(f'a fonte {fonte.arquivo.split("/")[-1]} não tem: {" ".join(faltam)} (texto: {texto[:40]!r})')


# ---------- texto com ênfase (*trecho* vira itálico em destaque) ----------
def palavras(texto):
    out = []
    for i, parte in enumerate(texto.split('*')):
        ps = parte.split()
        # pontuação colada depois da ênfase ("*dúvida*?") fica na mesma palavra
        if ps and out and i % 2 == 0 and not parte[0].isspace() and not ps[0][0].isalnum():
            out[-1] = (out[-1][0] + ps.pop(0), out[-1][1])
        out.extend((p, i % 2) for p in ps)
    return out


@dataclass
class Estilo:
    fonte: Fonte
    tam_max: int
    tam_min: int
    lh: float = 1.2
    enfase: Fonte = None        # fonte do trecho entre *asteriscos*
    max_linhas: int = None
    balancear: bool = False     # títulos: linhas de comprimento parecido
    justo: bool = False         # números gigantes: altura medida no próprio texto, sem folga de acento


@dataclass
class Bloco:
    linhas: list
    tam: int
    estilo: Estilo
    larg: float
    alt: float
    asc: float

    @property
    def n(self):
        return len(self.linhas)


@lru_cache(maxsize=None)
def _lp(arquivo, peso, px, txt):
    return _ft(arquivo, peso, px).getlength(txt)


def _larg_pal(p, e, est, tam):
    f = (est.enfase or est.fonte) if e else est.fonte
    return _lp(f.arquivo, f.peso, round(tam * SS), p) / SS


def _espaco(est, tam):
    return _lp(est.fonte.arquivo, est.fonte.peso, round(tam * SS), ' ') / SS


def _larg_linha(linha, est, tam):
    return sum(_larg_pal(p, e, est, tam) for p, e in linha) + _espaco(est, tam) * (len(linha) - 1)


def _quebrar(pal, est, tam, larg):
    esp = _espaco(est, tam)
    linhas, atual, wa = [], [], 0
    for p, e in pal:
        wp = _larg_pal(p, e, est, tam)
        if wp > larg:
            return None  # uma palavra sozinha não cabe
        if atual and wa + esp + wp > larg:
            linhas.append(atual)
            atual, wa = [(p, e)], wp
        else:
            wa = wa + esp + wp if atual else wp
            atual.append((p, e))
    if atual:
        linhas.append(atual)
    return linhas


def _metricas(est, tam):
    f = ft(est.fonte, tam)
    asc = -f.getbbox('ÉÂhl', anchor='ls')[1] / SS
    desc = f.getbbox('gjpqyç,', anchor='ls')[3] / SS
    return asc, desc


def _montar(pal, est, tam, larg):
    linhas = _quebrar(pal, est, tam, larg)
    if linhas is None:
        return None
    n = len(linhas)
    if n > 1 and est.balancear:
        # título: mesma quantidade de linhas na menor largura possível, para equilibrar as linhas
        lo, hi = larg * 0.55, larg
        for _ in range(12):
            meio = (lo + hi) / 2
            t = _quebrar(pal, est, tam, meio)
            if t is not None and len(t) == n:
                linhas, hi = t, meio
            else:
                lo = meio
    elif n > 1 and len(linhas[-1]) == 1:
        # corpo: evita palavra sozinha na última linha, estreitando o mínimo necessário
        for k in range(1, 10):
            t = _quebrar(pal, est, tam, larg * (1 - 0.02 * k))
            if t is not None and len(t) == n and len(t[-1]) > 1:
                linhas = t
                break
    asc, desc = _metricas(est, tam)
    if est.justo:
        cx = ft(est.fonte, tam).getbbox(' '.join(p for p, _ in pal), anchor='ls')
        asc, desc = -cx[1] / SS, max(0, cx[3]) / SS
    alt = asc + (n - 1) * tam * est.lh + desc
    return Bloco(linhas, tam, est, max(_larg_linha(l, est, tam) for l in linhas), alt, asc)


def encaixar(texto, est, larg, alt_max=None, tam_teto=None):
    """Maior corpo (entre tam_min e tam_max) em que o texto cabe na caixa. Falha se nenhum couber."""
    pal = palavras(texto)
    if not pal:
        raise TextoNaoCabe('texto vazio')
    conferir_glifos(''.join(p for p, e in pal if not e), est.fonte)
    conferir_glifos(''.join(p for p, e in pal if e), est.enfase or est.fonte)
    teto = min(est.tam_max, tam_teto or est.tam_max)
    tam = max(teto, est.tam_min)
    while tam >= est.tam_min:
        b = _montar(pal, est, tam, larg)
        if b and (not est.max_linhas or b.n <= est.max_linhas) and (alt_max is None or b.alt <= alt_max):
            return b
        tam -= 2
    raise TextoNaoCabe(f'não cabe em {larg:.0f}x{alt_max or 0:.0f} px nem no corpo mínimo {est.tam_min}: {texto[:60]!r}')


# ---------- tela ----------
class Tela:
    def __init__(self, fundo, w=W, h=H, segura=None, base=None):
        # base: imagem RGB (em 2x) que fica ATRÁS desta tela. Com ela a tela é uma camada transparente
        # (Reel) e o contraste é medido contra base + o que já foi desenhado.
        self.W, self.H = w, h
        self.segura = segura or (SEGURA, SEGURA, SEGURA, SEGURA)     # esquerda, topo, direita, base
        self.base = base
        self.img = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0)) if base is not None else Image.new('RGB', (w * SS, h * SS), fundo)
        self.d = ImageDraw.Draw(self.img)
        self.caixas = []
        self.trechos = []
        self._bloco = 0

    # formas (decorativas, não entram na conferência de texto)
    def ret(self, x0, y0, x1, y1, cor, raio=0, borda=None, esp=2):
        b = [round(v * SS) for v in (x0, y0, x1, y1)]
        self.d.rounded_rectangle(b, radius=round(raio * SS), fill=cor, outline=borda,
                                 width=round(esp * SS) if borda else 0)

    def linha(self, x0, y0, x1, y1, cor, esp=2):
        self.d.line([round(v * SS) for v in (x0, y0, x1, y1)], fill=cor, width=round(esp * SS))

    def anel(self, cx, cy, r, cor, esp=2):
        self.d.ellipse([round(v * SS) for v in (cx - r, cy - r, cx + r, cy + r)], outline=cor, width=round(esp * SS))

    def disco(self, cx, cy, r, cor):
        self.d.ellipse([round(v * SS) for v in (cx - r, cy - r, cx + r, cy + r)], fill=cor)

    def _ref(self, copia=False):
        if self.base is not None:
            return Image.alpha_composite(self.base.convert('RGBA'), self.img).convert('RGB')
        return self.img.copy() if copia else self.img

    def cor_em(self, x, y):
        return self._ref().getpixel((min(self.W * SS - 1, round(x * SS)), min(self.H * SS - 1, round(y * SS))))[:3]

    def colar(self, caminho, x_dir, y_centro, larg_max, alt_max):
        """Cola uma imagem (logo) encostada à direita em x_dir, centrada em y_centro, dentro da caixa."""
        im = Image.open(caminho).convert('RGBA')
        f = min(larg_max * SS / im.width, alt_max * SS / im.height)
        im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
        pos = (round(x_dir * SS - im.width), round(y_centro * SS - im.height / 2))
        if self.img.mode == 'RGBA':
            camada = Image.new('RGBA', self.img.size, (0, 0, 0, 0))
            camada.paste(im, pos)
            self.img.alpha_composite(camada)
            self.d = ImageDraw.Draw(self.img)
        else:
            self.img.paste(im, pos, im)

    def seta(self, x, y, comp, cor, esp=2.5):
        self.linha(x, y, x + comp, y, cor, esp)
        self.linha(x + comp - 10, y - 9, x + comp, y, cor, esp)
        self.linha(x + comp - 10, y + 9, x + comp, y, cor, esp)

    def glifo(self, texto, fonte, tam, x, y, cor, ancora='ls'):
        """Letra ou número gigante de enfeite. Não é texto de leitura: não entra na conferência."""
        self.d.text((x * SS, y * SS), texto, font=ft(fonte, tam), fill=cor, anchor=ancora)

    # texto de leitura
    def _pior_contraste(self, caixa_px, cor, ref=None):
        x0, y0, x1, y1 = (round(v) for v in caixa_px)
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(self.W * SS, x1), min(self.H * SS, y1)
        if x1 <= x0 or y1 <= y0:
            return 0
        rec = (ref or self._ref()).crop((x0, y0, x1, y1))
        cores = rec.getcolors(1 << 14) or rec.getcolors(rec.width * rec.height)
        return min(contraste(cor, c[:3]) for _, c in cores)

    def _contraste_so(self, nome, caixa_px, cor, tam, peso, ref=None):
        """Confere contraste de um trecho que mistura estilos na mesma linha (a caixa da linha já é registrada)."""
        pior, ex = self._pior_contraste(caixa_px, cor, ref), exigido(tam, peso)
        self.trechos.append({'nome': nome, 'contraste': round(pior, 2), 'exigido': ex})
        if pior < ex:
            raise ContrasteInsuficiente(f'{nome}: contraste {pior:.2f} < {ex} ({hexa(cor)} sobre o fundo real)')

    def _registrar(self, nome, caixa_px, cor, tam, peso, ref=None):
        pior, ex = self._pior_contraste(caixa_px, cor, ref), exigido(tam, peso)
        self.caixas.append({'nome': nome, 'bloco': self._bloco, 'caixa': [round(v / SS) for v in caixa_px], 'corpo': tam, 'peso': peso,
                            'contraste': round(pior, 2), 'exigido': ex})
        if tam < CORPO_MINIMO:
            raise ErroLayout(f'{nome}: corpo {tam} menor que o mínimo {CORPO_MINIMO}')
        if pior < ex:
            raise ContrasteInsuficiente(f'{nome}: contraste {pior:.2f} < {ex} ({hexa(cor)} sobre o fundo real)')

    def bloco(self, b, x, y, cor, cor_enf=None, nome='texto', alinh='esq', larg=None):
        """Desenha o bloco com o topo em y. Devolve o y de baixo."""
        est = b.estilo
        fr, fe = ft(est.fonte, b.tam), ft(est.enfase or est.fonte, b.tam)
        esp = _espaco(est, b.tam) * SS
        self._bloco += 1
        antes = self._ref(copia=True)    # o contraste é medido contra o que havia ANTES deste bloco
        for i, linha in enumerate(b.linhas):
            base = (y + b.asc + i * b.tam * est.lh) * SS
            lw = _larg_linha(linha, est, b.tam)
            px = x * SS if alinh == 'esq' else (x + ((larg or b.larg) - lw) / 2) * SS
            for e in (0, 1):             # uma caixa por linha e por estilo
                cxs, p2 = [], px
                for pal, pe in linha:
                    f = fe if pe else fr
                    if pe == e:
                        cxs.append(self.d.textbbox((p2, base), pal, font=f, anchor='ls'))
                    p2 += _larg_pal(pal, pe, est, b.tam) * SS + esp
                if cxs:
                    cx = (min(c[0] for c in cxs), min(c[1] for c in cxs), max(c[2] for c in cxs), max(c[3] for c in cxs))
                    if e and any(not pe for _, pe in linha):
                        self._contraste_so(f'{nome} L{i + 1} ênfase', cx, cor_enf or cor, b.tam, (est.enfase or est.fonte).peso, antes)
                    else:
                        inteira = (round(px), cx[1], round(px + lw * SS), cx[3]) if not e else cx
                        self._registrar(f'{nome} L{i + 1}', inteira if all(pe == e for _, pe in linha) else cx,
                                        (cor_enf or cor) if e else cor, b.tam,
                                        (est.enfase or est.fonte).peso if e else est.fonte.peso, antes)
            for pal, pe in linha:
                f, c = (fe, cor_enf or cor) if pe else (fr, cor)
                self.d.text((px, base), pal, font=f, fill=c, anchor='ls')
                px += _larg_pal(pal, pe, est, b.tam) * SS + esp
        return y + b.alt

    def medir_espacado(self, texto, fonte, tam, esp):
        f = ft(fonte, tam)
        return (sum(f.getlength(ch) for ch in texto) / SS) + esp * (len(texto) - 1)

    def espacado(self, texto, fonte, tam, x, y_base, cor, esp=3, nome='rótulo', alinh='esq', larg_max=None, tam_min=CORPO_MINIMO):
        """Uma linha com espaçamento entre letras (rótulos em caixa alta). y_base = linha de base."""
        conferir_glifos(texto, fonte)
        self._bloco += 1
        while larg_max and self.medir_espacado(texto, fonte, tam, esp) > larg_max:
            tam -= 1
            if tam < tam_min:
                raise TextoNaoCabe(f'{nome}: {texto!r} não cabe em {larg_max:.0f} px')
        f = ft(fonte, tam)
        lw = self.medir_espacado(texto, fonte, tam, esp)
        if alinh == 'dir':
            x = x - lw
        elif alinh == 'centro':
            x = x - lw / 2
        px, by = x * SS, y_base * SS
        b0 = self.d.textbbox((px, by), texto[0], font=f, anchor='ls')
        topo = min(self.d.textbbox((0, by), ch, font=f, anchor='ls')[1] for ch in texto if not ch.isspace())
        fundo_ = max(self.d.textbbox((0, by), ch, font=f, anchor='ls')[3] for ch in texto if not ch.isspace())
        self._registrar(nome, (b0[0], topo, round((x + lw) * SS), fundo_), cor, tam, fonte.peso)
        for ch in texto:
            self.d.text((px, by), ch, font=f, fill=cor, anchor='ls')
            px += f.getlength(ch) + esp * SS
        return lw

    # conferência final
    def conferir(self):
        for c in self.caixas:
            x0, y0, x1, y1 = c['caixa']
            se, st, sd, sb = self.segura
            if x0 < se or y0 < st or x1 > self.W - sd or y1 > self.H - sb:
                raise ErroLayout(f'{c["nome"]} fora da margem de segurança: {c["caixa"]}')
        for i, a in enumerate(self.caixas):
            for b in self.caixas[i + 1:]:
                ax0, ay0, ax1, ay1 = a['caixa']
                bx0, by0, bx1, by1 = b['caixa']
                # linhas vizinhas do mesmo bloco: a caixa da perna do "g" pode encostar na do acento de baixo
                folga = 0.12 * a['corpo'] if a['bloco'] == b['bloco'] else 2
                if min(ax1, bx1) - max(ax0, bx0) > 2 and min(ay1, by1) - max(ay0, by0) > folga:
                    raise ErroLayout(f'textos sobrepostos: {a["nome"]} {a["caixa"]} x {b["nome"]} {b["caixa"]}')

    def salvar(self, caminho):
        self.conferir()
        self.img.resize((self.W, self.H), Image.LANCZOS).save(caminho, optimize=True)

    def salvar_recorte(self, caminho):
        """Camada transparente: confere, reduz e grava só o retângulo desenhado. Devolve (x, y, larg, alt)."""
        self.conferir()
        im = self.img.resize((self.W, self.H), Image.LANCZOS)
        cx = im.getbbox()
        if not cx:
            return None
        im.crop(cx).save(caminho)
        return [cx[0], cx[1], cx[2] - cx[0], cx[3] - cx[1]]


# ---------- pilha vertical ----------
class Pilha:
    """Empilha textos e elementos fixos numa coluna e reduz os corpos, juntos, até caber na altura."""

    def __init__(self, tela, larg):
        self.t, self.larg, self.itens = tela, larg, []

    def texto(self, texto, est, cor, cor_enf=None, nome='texto', gap=0, alinh='esq'):
        self.itens.append({'k': 't', 'texto': texto, 'est': est, 'cor': cor, 'enf': cor_enf, 'nome': nome, 'gap': gap, 'alinh': alinh})
        return self

    def fixo(self, alt, desenhar, gap=0):
        """desenhar(tela, x, y, larg) pinta um elemento de altura fixa (filete, selo, rótulo)."""
        self.itens.append({'k': 'f', 'alt': alt, 'fn': desenhar, 'gap': gap})
        return self

    def resolver(self, alt_disp):
        f = 1.0
        while True:
            total, no_min = 0, True
            for it in self.itens:
                if it['k'] == 't':
                    e = it['est']
                    teto = max(e.tam_min, int(e.tam_max * f))
                    no_min = no_min and teto <= e.tam_min
                    it['b'] = encaixar(it['texto'], e, self.larg, tam_teto=teto)
                    it['alt'] = it['b'].alt
                total += it['alt'] + it['gap']
            total -= self.itens[-1]['gap']
            if total <= alt_disp:
                self.alt = total
                return total
            if no_min:
                raise TextoNaoCabe(f'a coluna precisa de {total:.0f} px e só há {alt_disp:.0f} px, mesmo no corpo mínimo '
                                   f'({[i["texto"][:30] for i in self.itens if i["k"] == "t"]})')
            f -= 0.03

    def desenhar(self, x, y):
        for it in self.itens:
            if it['k'] == 't':
                self.t.bloco(it['b'], x, y, it['cor'], it['enf'], it['nome'], it['alinh'], self.larg)
            else:
                it['fn'](self.t, x, y, self.larg)
            y += it['alt'] + it['gap']
        return y
