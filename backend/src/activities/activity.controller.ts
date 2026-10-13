import type { NextFunction, Request, Response } from 'express';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { createActivityDto, uuidDto } from './activity.dto.js';
import { ActivityService } from './activity.service.js';

export class ActivityController {
  constructor(
    private readonly activities = new ActivityService(),
    private readonly analytics = new AnalyticsService(),
  ) {}
  list = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json(await this.activities.list());
    } catch (error) {
      next(error);
    }
  };
  getById = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const activity = await this.activities.getById(uuidDto.parse(request.params.id));
      await this.analytics.track('activity_viewed', { activityId: activity.id });
      response.json(activity);
    } catch (error) {
      next(error);
    }
  };
  create = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response
        .status(201)
        .json(await this.activities.create(createActivityDto.parse(request.body)));
    } catch (error) {
      next(error);
    }
  };
}
