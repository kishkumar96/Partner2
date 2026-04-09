export const PDF_TEMPLATE_CONFIG = {
  page: {
    widthMm: 210,
    heightMm: 297,
    horizontalMarginMm: 12,
    footerHeightMm: 9,
    contentTopMm: 15,
    previewGapMm: 12,
  },
  template: {
    page1ContentTopMm: 154,
    continuationContentTopMm: 28,
    headerHeightMm: 30,
    headerBanner: {
      topMm: 26,
      heightMm: 21,
    },
    reportDateTopMm: 30.5,
    brandingTopMm: 34.2,
    keyFiguresTitleTopMm: 146,
    keyFiguresTitleLeftMm: 14,
    keyFiguresTitleWidthMm: 182,
    situationTopMm: 228,
    qrSlot: { x: 177, y: 273, size: 20 },
    page2TableTopMm: 20,
    page2TitleTopMm: 10,
  },
  map: {
    slot: { x: 0, y: 47, w: 210, h: 96 },
    imageHeightMm: 82,
    captionHeightMm: 14,
    captionPaddingXmm: 8,
    captionText: 'Fig. 1: PDIE Dashboard map — hazard and impact layer snapshot.',
  },
  keyFigures: {
    boxes: [
      { x: 24.7, y: 172.25, w: 45.3, h: 14.81 },
      { x: 82.2, y: 172.25, w: 45.6, h: 14.81 },
      { x: 143.84, y: 172.25, w: 41.16, h: 14.81 },
      { x: 24.7, y: 205.48, w: 45.3, h: 14.81 },
      { x: 82.2, y: 205.48, w: 45.6, h: 14.81 },
      { x: 143.84, y: 205.48, w: 41.16, h: 14.81 },
    ],
  },
  labels: {
    reportPrefix: 'No. 01 |',
    branding: 'Pacific Disaster Impact & Exposure | PDIE Dashboard',
    keyFiguresTitle: 'KEY FIGURES',
    situationOverviewTitle: 'SITUATION OVERVIEW',
    sectorAnalysisTitle: 'SECTOR ANALYSIS',
    dataSourceNote:
      'Source: PDIE Dashboard / SPC. Loss values shown in USD. Data derived from hazard modelling.',
  },
} as const;

export function getPdfContentWidthMm() {
  return PDF_TEMPLATE_CONFIG.page.widthMm - PDF_TEMPLATE_CONFIG.page.horizontalMarginMm * 2;
}

export function getPdfContentBottomMm() {
  return PDF_TEMPLATE_CONFIG.page.heightMm - PDF_TEMPLATE_CONFIG.page.footerHeightMm - 4;
}

export function getPdfKeyFigureIconLayout(index: number) {
  const usesTightLayout = index === 0 || index === 2;

  return {
    usesTightLayout,
    iconSizeMm: usesTightLayout ? 11 : 14,
    previewMarginTopMm: usesTightLayout ? -20 : -5,
    previewMarginBottomMm: usesTightLayout ? -7 : 1,
    previewValueTopMm: 2.4,
    previewLabelTopMm: 8.6,
    exportIconOffsetYmm: usesTightLayout ? -20 : -19,
    exportValueOffsetYmm: 6.6,
    exportLabelTopOffsetMm: 8.8,
  };
}
