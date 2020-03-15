
from datetime import datetime
from reportlab.platypus import PageTemplate, BaseDocTemplate, Frame, Paragraph
from reportlab.lib.units import cm, mm
from reportlab.lib.sequencer import Sequencer
from reportlab.lib.pagesizes import A4


class FrontCoverTemplate(PageTemplate):
    def __init__(self, id, pageSize=A4, title='Title Goes Here', subtitle=None):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        self.title = title
        self.subtitle = subtitle

        frame1 = Frame(2.5 * cm,
                       2.5 * cm,
                       self.pageWidth - 5 * cm,
                       self.pageHeight - 260, id='cover')
        PageTemplate.__init__(self, id, [frame1])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
       
        canvas.saveState()
        canvas.setFont('Helvetica', 24)
        canvas.drawCentredString(self.pageWidth / 2, self.pageHeight - 2.5 * cm, self.title)

        if self.subtitle:
            canvas.setFont('Helvetica-Oblique', 20)
            canvas.drawCentredString(self.pageWidth / 2, self.pageHeight - 3.15 * cm, self.subtitle)
            canvas.setFont('Helvetica', 10)
            canvas.drawCentredString(self.pageWidth / 2, self.pageHeight - 3.75 * cm, 'Generated: ' + datetime.utcnow().replace(microsecond=0).strftime("%c"))
            canvas.drawImage('./assets/images/Subastian_Profile.png', self.pageWidth / 2 - 40 * 400/233, self.pageHeight - 6.75 * cm, width=80 * 400/233, height=80, mask='auto')

        else:
            canvas.setFont('Helvetica', 10)
            canvas.drawCentredString(self.pageWidth / 2, self.pageHeight - 3.15 * cm, 'Generated: ' + datetime.utcnow().replace(microsecond=0).strftime("%c"))
            canvas.drawImage('./assets/images/Subastian_Profile.png', self.pageWidth / 2 - 40 * 400/233, self.pageHeight - 6.25 * cm, width=80 * 400/233, height=80, mask='auto')

        canvas.setFont('Helvetica', 10)
        canvas.line(2 * cm, 80, self.pageWidth - 2 * cm, 80)

        canvas.drawString(2 * cm, 60, 'Schmidt Ocean Institute')
        canvas.drawString(2 * cm, 48, '555 Bryant St. #374')
        canvas.drawString(2 * cm, 36, 'Palo Alto, CA 94301')
        canvas.drawImage('./assets/images/soi-logo.png', self.pageWidth - 2 * cm - 40 * 161/122, 30, width=40 * 161/122, height=40, mask='auto')

        canvas.restoreState()


class OneColumnTemplate(PageTemplate):
    def __init__(self, id, pageSize=A4):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        frame1 = Frame(2.5 * cm,
                       2.5 * cm,
                       self.pageWidth - 5 * cm,
                       self.pageHeight - 5 * cm,
                       id='normal')
        PageTemplate.__init__(self, id, [frame1])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
        y = self.pageHeight - 50
        canvas.saveState()
        canvas.setFont('Helvetica', 10)
        canvas.drawString(2 * cm, y+8, doc.title)
        canvas.drawRightString(self.pageWidth - 2 * cm, y+8, doc.chapter)
        canvas.line(2 * cm, y, self.pageWidth - 2 * cm, y)
        canvas.drawCentredString(self.pageWidth / 2, 2 * cm, 'Page %d' % canvas.getPageNumber())
        canvas.restoreState()

class TOCTemplate(PageTemplate):
    def __init__(self, id, pageSize=A4):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        frame1 = Frame(2.5 * cm,
                       2.5 * cm,
                       self.pageWidth - 5 * cm,
                       self.pageHeight - 5.5 * cm,
                       id='normal')
        PageTemplate.__init__(self, id, [frame1])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
        y = self.pageHeight - 50
        canvas.saveState()
        # canvas.setFont('Helvetica', 10)
        # canvas.drawString(cm, y+8, doc.title)
        # canvas.drawRightString(self.pageWidth - cm, y+8, 'Table of contents')
        # canvas.line(cm, y, self.pageWidth - cm, y)

        canvas.setFont('Helvetica', 22)
        canvas.drawCentredString(self.pageWidth / 2, self.pageHeight - 2 * cm, 'Table of Contents')

        canvas.setFont('Helvetica', 10)
        canvas.drawCentredString(self.pageWidth / 2, 2 * cm, 'Page %d' % canvas.getPageNumber())
        canvas.restoreState()

class TwoColumnTemplate(PageTemplate):
    def __init__(self, id, pageSize=A4):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        colWidth = 0.5 * (self.pageWidth - 6 * cm)
        frame1 = Frame(2.5 * cm,
                       2.5 * cm,
                       colWidth,
                       self.pageHeight - 5 * cm,
                       id='leftCol')
        frame2 = Frame(0.5 * self.pageWidth + 0.125,
                       cm,
                       colWidth,
                       self.pageHeight - 5 * cm,
                       id='rightCol')
        PageTemplate.__init__(self, id, [frame1, frame2])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
        y = self.pageHeight - 50
        canvas.saveState()
        canvas.setFont('Helvetica', 10)
        canvas.drawString(cm, y+8, doc.title)
        canvas.drawRightString(self.pageWidth - cm, y+8, doc.chapter)
        canvas.line(cm, y, self.pageWidth - 2.5 * cm, y * 2.5 * cm)
        canvas.drawCentredString(self.pageWidth / 2, 2 * cm, 'Page %d' % canvas.getPageNumber())
        canvas.restoreState()


class RLDocTemplate(BaseDocTemplate):

    def __init__(self, *args, **kwargs):

        try:
            self.subtitle = kwargs.pop('subtitle')
        except KeyError:
            self.subtitle = None
            pass

        super().__init__(*args, **kwargs)

    def afterInit(self):
        self.addPageTemplates(FrontCoverTemplate('Cover', self.pagesize, title=self.title, subtitle=self.subtitle))
        self.addPageTemplates(TOCTemplate('TOC', self.pagesize))
        self.addPageTemplates(OneColumnTemplate('Normal', self.pagesize))
        self.addPageTemplates(TwoColumnTemplate('TwoColumn', self.pagesize))
        self.seq = Sequencer()

    def beforeDocument(self):
        self.canv.showOutline()
        self.title = self.title
        self.chapter = ""
        self.seq.reset('section')
        self.seq.reset('chapter')

    def afterFlowable(self, flowable):
        """
        Detect Level 1 and 2 headings, build outline,
        and track chapter title.
        """

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