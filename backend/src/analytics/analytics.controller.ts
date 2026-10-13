import type { NextFunction, Request, Response } from 'express';
import { availabilityReceiptDto } from './analytics.dto.js';
import { AnalyticsService } from './analytics.service.js';

export class AnalyticsController {
  constructor(private readonly analytics = new AnalyticsService()) {}
  recordAvailabilityReceipt = async (request: Request, response: Response, next: NextFunction) => {
    try {
      await this.analytics.recordAvailabilityReceipt(availabilityReceiptDto.parse(request.body));
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}
