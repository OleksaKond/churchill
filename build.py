#!/usr/bin/env python3
"""Generate per-language pages (en/, pl/, ar/, ru/) from templates/.

Edit templates/index.template.html and templates/gallery.template.html,
then run `python build.py` to regenerate all language directories.
"""
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
LANGS = ['en', 'pl', 'ar', 'ru']
RTL = {'ar'}
# Polish gets the Polish food menu; every other language gets English.
FOOD_PDF = {'pl': 'Food%20Menu%20pol.pdf'}
FOOD_PDF_DEFAULT = 'Food%20Menu%20eng.pdf'


def switcher(current, page):
    """Language links, e.g. page='index.html' or page='gallery.html'.
    Always link to an explicit file (not a bare ../en/ directory) so it works
    on file:// and hosts that don't auto-serve a directory index."""
    out = []
    for i, l in enumerate(LANGS):
        href = '../{}/{}'.format(l, page)
        if l == current:
            out.append('<span class="text-gold-accent">{}</span>'.format(l.upper()))
        else:
            out.append('<a class="text-gray-400 hover:text-white transition-colors" href="{}">{}</a>'.format(href, l.upper()))
        if i < len(LANGS) - 1:
            out.append('<span class="text-gray-600">|</span>')
    return '\n'.join(out)


def gallery_items():
    cats = ['shisha', 'drinks', 'food', 'cigars']  # room is empty
    labels = {'shisha': 'Shisha', 'drinks': 'Drinks', 'food': 'Food', 'cigars': 'Cigars & Lounge'}

    def numkey(f):
        m = re.search(r'photo_(\d+)_', f)
        return int(m.group(1)) if m else 0

    lists = {}
    for c in cats:
        d = os.path.join(ROOT, 'photos', c)
        files = sorted([f for f in os.listdir(d) if f.lower().endswith('.jpg')], key=numkey)
        lists[c] = files

    out, i = [], 0
    while any(i < len(lists[c]) for c in cats):
        for c in cats:
            if i < len(lists[c]):
                src = '../photos/{}/{}'.format(c, lists[c][i])
                out.append(
                    '<button class="gitem" data-cat="{c}" data-src="{s}">'
                    '<img loading="lazy" src="{s}" alt="{a} at Churchill\'s Lounge"/></button>'.format(
                        c=c, s=src, a=labels[c]))
        i += 1
    return '\n'.join(out)


def main():
    with open(os.path.join(ROOT, 'templates', 'index.template.html'), encoding='utf-8') as f:
        index_tpl = f.read()
    with open(os.path.join(ROOT, 'templates', 'gallery.template.html'), encoding='utf-8') as f:
        gallery_tpl = f.read()

    items = gallery_items()
    n_items = items.count('class="gitem"')

    for lang in LANGS:
        d = os.path.join(ROOT, lang)
        os.makedirs(d, exist_ok=True)
        direction = 'rtl' if lang in RTL else 'ltr'
        food = FOOD_PDF.get(lang, FOOD_PDF_DEFAULT)

        index_html = (index_tpl
                      .replace('%%LANG%%', lang)
                      .replace('%%DIR%%', direction)
                      .replace('%%FOODPDF%%', food)
                      .replace('%%SWITCHER%%', switcher(lang, 'index.html')))
        with open(os.path.join(d, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(index_html)

        gallery_html = (gallery_tpl
                        .replace('%%LANG%%', lang)
                        .replace('%%DIR%%', direction)
                        .replace('%%SWITCHER%%', switcher(lang, 'gallery.html'))
                        .replace('%%GALLERY_ITEMS%%', items))
        with open(os.path.join(d, 'gallery.html'), 'w', encoding='utf-8') as f:
            f.write(gallery_html)

        print('generated {}/index.html + {}/gallery.html'.format(lang, lang))

    print('gallery items per page:', n_items)


if __name__ == '__main__':
    main()
