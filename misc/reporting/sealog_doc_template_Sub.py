#!/usr/bin/env python3
'''
FILE:           sealog_doc_template.py

DESCRIPTION:    ReportLab document template

BUGS:
NOTES:
AUTHOR:     Webb Pinner
COMPANY:    OceanDataTools.org
VERSION:    1.0
CREATED:    2021-05-03
REVISION:   2021-07-23

LICENSE INFO:   This code is licensed under MIT license (see LICENSE.txt for details)
                Copyright (C) OceanDataTools.org 2022
'''

import os
from datetime import datetime
from reportlab.platypus import PageTemplate, BaseDocTemplate, Frame, Paragraph
from reportlab.lib.units import cm
from reportlab.lib.sequencer import Sequencer
from reportlab.lib.pagesizes import LETTER

PAGE_SIZE = LETTER

class FrontCoverTemplate(PageTemplate):
    '''
    Template for cover page layout
    '''

    def __init__(self, page_id, pagesize=PAGE_SIZE, title='Title Goes Here', subtitle=None):

        self.page_width = pagesize[0]
        self.page_height = pagesize[1]
        self.title = title
        self.subtitle = subtitle

        frame1 = Frame(2.5 * cm,
                       2.5 * cm,
                       self.page_width - 5 * cm,
                       self.page_height - 8 * cm, id='cover')
        PageTemplate.__init__(self, page_id, [frame1])  # note lack of onPage


    def afterDrawPage(self, canv, doc):
        '''
        Actions to take after drawPage
        '''

        # canv.saveState()
        # canv.setFont('Helvetica', 18)
        # canv.drawString(self.page_width / 2, self.page_height - 2.65 * cm, self.title)

        # if self.subtitle:
        #     canv.setFont('Helvetica-Oblique', 14)
        #     canv.drawCentredString(self.page_width / 2, self.page_height - 3.35 * cm, self.subtitle)
        #     canv.setFont('Helvetica', 10)
        #     canv.drawCentredString(self.page_width / 2, self.page_height - 3.85 * cm, 'Generated: ' + datetime.utcnow().replace(microsecond=0).strftime("%c"))
        #     canv.drawImage(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'../assets/images/Subastian_Profile.png')), self.page_width / 2 - 140 / 2, self.page_height - 7 * cm, width=140, height= 140 * 233/400, mask='auto')

        # else:
        #     canv.setFont('Helvetica', 10)
        #     canv.drawCentredString(self.page_width / 2, self.page_height - 3.25 * cm, 'Generated: ' + datetime.utcnow().replace(microsecond=0).strftime("%c"))
        #     canv.drawImage(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'../assets/images/Subastian_Profile.png')), self.page_width / 2 - 140 / 2, self.page_height - 6.35 * cm, width=140, height= 140 * 233/400, mask='auto')

        # canv.setFont('Helvetica', 10)
        # canv.line(2 * cm, 80, self.page_width - 2 * cm, 80)

        canv.saveState()
        canv.setFont('Helvetica', 18)
        canv.drawString(7.5 * cm, self.page_height - 2.6 * cm, self.title)

        if self.subtitle:
            canv.drawImage(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'../assets/images/Subastian_Profile.png')), 2.5 * cm, self.page_height - 4.5 * cm, width=80 * 1153/675, height=80, mask='auto')
            canv.setFont('Helvetica-Oblique', 14)
            canv.drawString(7.5 * cm, self.page_height - 3.35 * cm, self.subtitle)
            canv.setFont('Helvetica', 10)
            canv.drawString(7.5 * cm, self.page_height - 3.85 * cm, 'Generated: ' + datetime.utcnow().replace(microsecond=0).strftime("%c"))

        else:
            canv.drawImage(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'../assets/images/Subastian_Profile.png')), 2.5 * cm, self.page_height - 4.5 * cm, width=80 * 1153/675, height=80, mask='auto')
            canv.setFont('Helvetica', 10)
            canv.drawString(7.5 * cm, self.page_height - 3.35 * cm, 'Generated: ' + datetime.utcnow().replace(microsecond=0).strftime("%c"))

        canv.setFont('Helvetica', 10)
        canv.line(2 * cm, 80, self.page_width - 2 * cm, 80)
        canv.drawString(2 * cm, 60, 'Schmidt Ocean Institute')
        canv.drawString(2 * cm, 48, '555 Bryant St. #374')
        canv.drawString(2 * cm, 36, 'Palo Alto, CA 94301')
        canv.drawImage(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'../assets/images/soi-logo.png')), self.page_width - 2 * cm - 40 * 161/122, 30, width=40 * 161/122, height=40, mask='auto')

        canv.restoreState()


class OneColumnTemplate(PageTemplate):
    '''
    Template for 1-column page layout
    '''

    def __init__(self, page_id, pagesize=PAGE_SIZE):

        self.page_width = pagesize[0]
        self.page_height = pagesize[1]
        frame1 = Frame(2.5 * cm,
                       2.5 * cm,
                       self.page_width - 5 * cm,
                       self.page_height - 5 * cm,
                       id='normal')
        PageTemplate.__init__(self, page_id, [frame1])  # note lack of onPage


    def afterDrawPage(self, canv, doc):
        '''
        Actions to take after drawPage
        '''

        y_pos = self.page_height - 50
        canv.saveState()
        canv.setFont('Helvetica', 10)
        canv.drawString(2 * cm, y_pos+8, doc.title)
        canv.drawRightString(self.page_width - 2 * cm, y_pos+8, doc.chapter)
        canv.line(2 * cm, y_pos, self.page_width - 2 * cm, y_pos)
        canv.drawCentredString(self.page_width / 2, 2 * cm, 'Page %d' % canv.getPageNumber())
        canv.restoreState()


class TOCTemplate(PageTemplate):
    '''
    Template for table of contents
    '''

    def __init__(self, page_id, pagesize=PAGE_SIZE):

        self.page_width = pagesize[0]
        self.page_height = pagesize[1]
        frame1 = Frame(2.5 * cm,
                       2.5 * cm,
                       self.page_width - 5 * cm,
                       self.page_height - 5.5 * cm,
                       id='normal')
        PageTemplate.__init__(self, page_id, [frame1])  # note lack of onPage


    def afterDrawPage(self, canv, doc):
        '''
        Actions to take after drawPage
        '''

        canv.saveState()
        canv.setFont('Helvetica', 22)
        canv.drawCentredString(self.page_width / 2, self.page_height - 2 * cm, 'Table of Contents')

        canv.setFont('Helvetica', 10)
        canv.drawCentredString(self.page_width / 2, 2 * cm, 'Page %d' % canv.getPageNumber())
        canv.restoreState()


class TwoColumnTemplate(PageTemplate):
    '''
    Template for 2-column page layout
    '''

    def __init__(self, page_id, pagesize=PAGE_SIZE):

        self.page_width = pagesize[0]
        self.page_height = pagesize[1]
        col_width = 0.5 * (self.page_width - 6 * cm)
        frame1 = Frame(2.5 * cm,
                       2.5 * cm,
                       col_width,
                       self.page_height - 5 * cm,
                       id='leftCol')
        frame2 = Frame(0.5 * self.page_width + 0.125,
                       cm,
                       col_width,
                       self.page_height - 5 * cm,
                       id='rightCol')
        PageTemplate.__init__(self, page_id, [frame1, frame2])  # note lack of onPage


    def afterDrawPage(self, canv, doc):
        '''
        Actions to take after drawPage
        '''

        y_pos = self.page_height - 50
        canv.saveState()
        canv.setFont('Helvetica', 10)
        canv.drawString(cm, y_pos+8, doc.title)
        canv.drawRightString(self.page_width - cm, y_pos+8, doc.chapter)
        canv.line(cm, y_pos, self.page_width - 2.5 * cm, y_pos * 2.5 * cm)
        canv.drawCentredString(self.page_width / 2, 2 * cm, 'Page %d' % canv.getPageNumber())
        canv.restoreState()


class RLDocTemplate(BaseDocTemplate):
    '''
    ReportLab-style document template
    '''

    def __init__(self, *args, **kwargs):

        self.title = kwargs.get('title')

        try:
            self.subtitle = kwargs.pop('subtitle')
        except KeyError:
            self.subtitle = None

        try:
            self.pagesize = kwargs.get('pagesize')
        except KeyError:
            self.pagesize = PAGE_SIZE

        self.chapter = ''
        self.section = ''

        super().__init__(*args, **kwargs)


    def afterInit(self):
        '''
        Actions to take after init
        '''

        self.addPageTemplates(FrontCoverTemplate('Cover', title=self.title, subtitle=self.subtitle, pagesize=self.pagesize))
        self.addPageTemplates(TOCTemplate('TOC', pagesize=self.pagesize))
        self.addPageTemplates(OneColumnTemplate('Normal', pagesize=self.pagesize))
        self.addPageTemplates(TwoColumnTemplate('TwoColumn', pagesize=self.pagesize))
        self.seq = Sequencer()


    def beforeDocument(self):
        '''
        Actions to take before build document
        '''

        self.canv.showOutline()
        self.seq.reset('section')
        self.seq.reset('chapter')


    def afterFlowable(self, flowable):
        '''
        Detect Level 1 and 2 headings, build outline, and track chapter title.
        '''

        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            txt = flowable.getPlainText()

            if style == 'Title':
                self.title = txt
            elif style == 'Heading1':
                self.chapter = txt
                key = 'ch%s' % self.seq.nextf('chapter')
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(txt, key, 0, 0)
                self.seq.reset("section")
                self.notify('TOCEntry', (0, txt, self.page, key))
            elif style == 'Heading2':
                self.section = flowable.text
                key = 'ch%ss%s' % (self.seq.thisf("chapter"), self.seq.nextf("section"))
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(txt, key, 1, 0)
                self.notify('TOCEntry', (1, txt, self.page, key))
