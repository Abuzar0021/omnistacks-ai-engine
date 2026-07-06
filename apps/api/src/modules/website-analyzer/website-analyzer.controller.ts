import { asyncHandler } from '../../lib/async-handler.js';
import { readScreenshot } from './screenshot-storage.js';
import {
  analysisIdParamSchema,
  businessIdParamSchema,
  listAnalysesQuerySchema,
} from './website-analyzer.schemas.js';
import { websiteAnalysisService } from './website-analyzer.service.js';

export const startAnalysis = asyncHandler(async (req, res) => {
  const { businessId } = businessIdParamSchema.parse(req.params);
  const analysis = await websiteAnalysisService.start(businessId);
  res.status(202).json({ data: analysis });
});

export const listAnalyses = asyncHandler(async (req, res) => {
  const { businessId } = businessIdParamSchema.parse(req.params);
  const { page, limit } = listAnalysesQuerySchema.parse(req.query);
  const result = await websiteAnalysisService.listByBusiness(businessId, page, limit);
  res.json({
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

/** Serves both "check status" and "retrieve results" — the same resource carries both. */
export const getAnalysis = asyncHandler(async (req, res) => {
  const { id } = analysisIdParamSchema.parse(req.params);
  const analysis = await websiteAnalysisService.getById(id);
  res.json({ data: analysis });
});

export const getScreenshotMeta = asyncHandler(async (req, res) => {
  const { id } = analysisIdParamSchema.parse(req.params);
  const analysis = await websiteAnalysisService.getScreenshot(id);
  res.json({
    data: {
      width: analysis.screenshotWidth,
      height: analysis.screenshotHeight,
      byteSize: analysis.screenshotByteSize,
      mimeType: analysis.screenshotMimeType,
      url: `/api/website-analyses/${analysis.id}/screenshot/file`,
    },
  });
});

export const getScreenshotFile = asyncHandler(async (req, res) => {
  const { id } = analysisIdParamSchema.parse(req.params);
  const analysis = await websiteAnalysisService.getScreenshot(id);
  const buffer = await readScreenshot(analysis.screenshotPath as string);
  res.setHeader('Content-Type', analysis.screenshotMimeType ?? 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(buffer);
});
