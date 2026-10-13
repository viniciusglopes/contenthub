#!/usr/bin/env python3
"""Porta de entrada do motor de arte do Estúdio. Chamado pelo ContentHub como processo filho.

Entrada: UM objeto JSON na entrada padrão. Saída: UM objeto JSON na saída padrão.
    {"op": "carrossel", "kit": {...}, "roteiro": {...}, "saida": "/pasta"}
    {"op": "slide",     "kit": {...}, "modelo": "editorial", "slide": {...}, "i": 1, "n": 7, "saida": "/arq.png"}
    {"op": "reel",      "kit": {...}, "cenas": [...], "saida": "/pasta"}
O roteiro já chega validado (schema e regras do setor) pelo ContentHub: aqui só se desenha, e
qualquer texto que não caiba, fique sem contraste ou use caractere que a fonte não tem vira
{"ok": false, "tipo": "...", "erro": "..."} em vez de arte ruim. Não abre rede, não lê nada
fora dos caminhos recebidos.
"""
import json
import os
import sys
import time

RAIZ = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, RAIZ)

from gerador.layout import ErroLayout, W, H          # noqa: E402
from gerador.modelos import MODELOS, Tema, MARGEM    # noqa: E402
from gerador.reel import camadas_reel               # noqa: E402


def _assinatura(kit):
    partes = [kit['nome']]
    if kit.get('profissao'):
        partes.append(kit['profissao'])
    if kit.get('registro_profissional'):
        partes.append(kit['registro_profissional'])
    return ' · '.join(partes)


def _slide(fn, tm, kit, s, i, n, caminho):
    tela = fn(s, tm, {'i': i, 'n': n, 'arroba': kit['arroba'], 'assinatura': kit['assinatura']})
    if kit.get('logo') and s['tipo'] == 'capa':      # a capa não tem número de página: o canto é do logo
        tela.colar(kit['logo'], W - MARGEM, 96, 230, 84)
    tela.salvar(caminho)
    return {'arquivo': caminho, 'tipo': s['tipo'], 'ocupacao': getattr(tela, 'ocupacao', None),
            'menor_contraste': min(c['contraste'] for c in tela.caixas), 'menor_corpo': min(c['corpo'] for c in tela.caixas)}


def main():
    t0 = time.perf_counter()
    p = json.load(sys.stdin)
    kit = p['kit']
    kit['assinatura'] = _assinatura(kit)
    if kit.get('logo'):
        try:                      # logo ilegível não derruba a arte: sai sem logo
            from PIL import Image
            Image.open(kit['logo']).verify()
        except Exception:
            kit['logo'] = None
    try:
        tm = Tema(kit, os.path.join(RAIZ, 'fontes'))
        if p['op'] == 'carrossel':
            r = p['roteiro']
            os.makedirs(p['saida'], exist_ok=True)
            n = len(r['slides'])
            slides = []
            for i, s in enumerate(r['slides'], 1):
                try:
                    slides.append(_slide(MODELOS[r['modelo']], tm, kit, s, i, n, os.path.join(p['saida'], f'slide_{i:02d}.png')))
                except ErroLayout as e:
                    raise type(e)(f'slide {i}: {e}')
            out = {'slides': slides, 'largura': W, 'altura': H}
        elif p['op'] == 'slide':
            out = {'slide': _slide(MODELOS[p['modelo']], tm, kit, p['slide'], p.get('i', 1), p.get('n', 5), p['saida'])}
        elif p['op'] == 'reel':
            out = {'cenas': camadas_reel(kit, tm, p['cenas'], p['saida'])}
        else:
            raise ValueError('operação desconhecida')
        out.update(ok=True, ajustes_de_cor=tm.ajustes, tempo_s=round(time.perf_counter() - t0, 2))
    except ErroLayout as e:
        out = {'ok': False, 'tipo': type(e).__name__, 'erro': str(e)}
    except Exception as e:      # erro nosso: quem chamou registra e mostra mensagem genérica
        out = {'ok': False, 'tipo': 'Interno', 'erro': f'{type(e).__name__}: {e}'}
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
