
from datetime import datetime
from reportlab.platypus import PageTemplate, BaseDocTemplate, Frame, Paragraph
from reportlab.lib.units import inch
from reportlab.lib.sequencer import Sequencer
from reportlab.lib.pagesizes import letter


class FrontCoverTemplate(PageTemplate):
    def __init__(self, id, pageSize=letter, title='Title Goes Here', subtitle=None):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        self.title = title
        self.subtitle = subtitle

        frame1 = Frame(inch,
                       1.5*inch,
                       self.pageWidth - 2*inch,
                       self.pageHeight - 318, id='cover')
        PageTemplate.__init__(self, id, [frame1])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
       
        canvas.saveState()
        canvas.setFont('Helvetica', 24)
        canvas.drawCentredString(self.pageWidth / 2, self.pageHeight - 1 * inch, self.title)

        if self.subtitle:
            canvas.setFont('Helvetica-Oblique', 20)
            canvas.drawCentredString(self.pageWidth / 2, self.pageHeight - 1.5 * inch, self.subtitle)
            canvas.setFont('Helvetica', 10)
            canvas.drawCentredString(self.pageWidth / 2, self.pageHeight - 1.75 * inch, 'Generated: ' + datetime.utcnow().replace(microsecond=0).strftime("%c"))
            canvas.drawImage('./assets/images/Subastian_Profile.png', self.pageWidth / 2 - inch - 40 * 400/233, self.pageHeight - 2.15 * inch, width=80 * 400/233, height=80, mask='auto')

        else:
            canvas.setFont('Helvetica', 10)
            canvas.drawCentredString(self.pageWidth / 2, self.pageHeight - 1.25 * inch, 'Generated: ' + datetime.utcnow().replace(microsecond=0).strftime("%c"))
            canvas.drawImage('./assets/images/Subastian_Profile.png', self.pageWidth / 2 - inch - 0 * 400/233, self.pageHeight - 2.5 * inch, width=80 * 400/233, height=80, mask='auto')

        canvas.setFont('Helvetica', 10)
        canvas.line(inch, 120, self.pageWidth - inch, 120)

        canvas.drawString(inch, 100, 'Schmidt Ocean Institute')
        canvas.drawString(inch, 88, '555 Bryant St. #374')
        canvas.drawString(inch, 76, 'Palo Alto, CA 94301')
        canvas.drawImage('./assets/images/soi-logo.png', self.pageWidth - inch - 40 * 161/122, 1*inch, width=40 * 161/122, height=40, mask='auto')

        canvas.restoreState()


class OneColumnTemplate(PageTemplate):
    def __init__(self, id, pageSize=letter):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        frame1 = Frame(inch,
                       inch,
                       self.pageWidth - 2*inch,
                       self.pageHeight - 2*inch,
                       id='normal')
        PageTemplate.__init__(self, id, [frame1])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
        y = self.pageHeight - 50
        canvas.saveState()
        canvas.setFont('Helvetica', 10)
        canvas.drawString(inch, y+8, doc.title)
        canvas.drawRightString(self.pageWidth - inch, y+8, doc.chapter)
        canvas.line(inch, y, self.pageWidth - inch, y)
        canvas.drawCentredString(self.pageWidth / 2, 0.75*inch, 'Page %d' % canvas.getPageNumber())
        canvas.restoreState()

class TOCTemplate(PageTemplate):
    def __init__(self, id, pageSize=letter):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        frame1 = Frame(inch,
                       inch,
                       self.pageWidth - 2*inch,
                       self.pageHeight - 2*inch,
                       id='normal')
        PageTemplate.__init__(self, id, [frame1])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
        y = self.pageHeight - 50
        canvas.saveState()
        canvas.setFont('Helvetica', 10)
        canvas.drawString(inch, y+8, doc.title)
        canvas.drawRightString(self.pageWidth - inch, y+8, 'Table of contents')
        canvas.line(inch, y, self.pageWidth - inch, y)
        canvas.drawCentredString(self.pageWidth / 2, 0.75*inch, 'Page %d' % canvas.getPageNumber())
        canvas.restoreState()

class TwoColumnTemplate(PageTemplate):
    def __init__(self, id, pageSize=letter):
        self.pageWidth = pageSize[0]
        self.pageHeight = pageSize[1]
        colWidth = 0.5 * (self.pageWidth - 2.25*inch)
        frame1 = Frame(inch,
                       inch,
                       colWidth,
                       self.pageHeight - 2*inch,
                       id='leftCol')
        frame2 = Frame(0.5 * self.pageWidth + 0.125,
                       inch,
                       colWidth,
                       self.pageHeight - 2*inch,
                       id='rightCol')
        PageTemplate.__init__(self, id, [frame1, frame2])  # note lack of onPage

    def afterDrawPage(self, canvas, doc):
        y = self.pageHeight - 50
        canvas.saveState()
        canvas.setFont('Helvetica', 10)
        canvas.drawString(inch, y+8, doc.title)
        canvas.drawRightString(self.pageWidth - inch, y+8, doc.chapter)
        canvas.line(inch, y, self.pageWidth - inch, y*inch)
        canvas.drawCentredString(self.pageWidth / 2, 0.75*inch, 'Page %d' % canvas.getPageNumber())
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
        self.chapter = "(No chapter yet)"
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