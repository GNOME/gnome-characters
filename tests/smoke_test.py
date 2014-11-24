#! /usr/bin/python

from testutil import *

from gi.repository import Gio, GLib

import os, sys
import pyatspi
from dogtail import tree
from dogtail import utils
from dogtail.procedural import *
from dogtail.rawinput import click

def active(widget):
    return widget.getState().contains(pyatspi.STATE_ARMED)
def visible(widget):
    return widget.getState().contains(pyatspi.STATE_VISIBLE)

PAGE_LABELS = [
    'Punctuation',
    'Arrows',
    'Bullets',
    'Pictures',
    'Currencies',
    'Math',
    'Latin',
    'Emoticons'
]

class Page(object):
    def __init__(self, app, label):
        self.button = app.child(label)
        self.character_list = app.child('%s Character List' % label)

init()
try:
    app = start()
    print "app started"
    assert app is not None

    pages = dict()
    for label in PAGE_LABELS:
        pages[label] = Page(app, label)

    recently_used_page = Page(app, 'Recently Used')
    assert recently_used_page.button.showing
    assert not recently_used_page.character_list.showing
    pages['Recently Used'] = recently_used_page

    # basic state
    for label, page in pages.items():
        assert page.button.showing
        if label in PAGE_LABELS:
            assert not page.character_list.showing

    # selection mode
    for label1 in PAGE_LABELS:
        page = pages[label1]
        page.button.click()
        assert page.character_list.showing
        for label2 in PAGE_LABELS:
            if label2 == label1:
                continue
            assert not pages[label2].character_list.showing

    # character dialog
    page = pages['Punctuation']
    page.button.click()
    x, y = page.character_list.position
    click(x + 10, y + 10)
    assert len(app.children) == 2
    character_dialog = app.children[-1]
    assert character_dialog.name == 'Exclamation Mark'
    see_also_button = character_dialog.child('See Also')
    assert see_also_button.showing

    see_also_button.click()
    keyCombo('Escape')

    # recently used characters
    recently_used_page = Page(app, 'Recently Used')
    recently_used_page.button.click()
    assert len(recently_used_page.character_list.children) > 0
finally:
    print "tearing down"
    fini()
