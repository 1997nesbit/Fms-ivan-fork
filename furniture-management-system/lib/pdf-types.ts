// RGB colour triple for use with jsPDF's setTextColor / setFillColor / autoTable styles
export type PDFColor = [number, number, number]

export const PDF_COLORS = {
  /** Dark navy — brand header, dividers */
  primary: [30, 58, 95] as PDFColor,

  /** Per-report-type accent colours */
  sales:       { primary: [16, 185, 129] as PDFColor },   // emerald green
  finance:     { primary: [59, 130, 246] as PDFColor },   // blue
  performance: { primary: [79, 123, 239] as PDFColor },   // indigo

  success: [34, 197, 94]   as PDFColor,
  warning: [180, 100,  0]  as PDFColor,   // amber (readable on white)
  danger:  [239, 68,  68]  as PDFColor,
  neutral: [100, 100, 100] as PDFColor,
} as const
