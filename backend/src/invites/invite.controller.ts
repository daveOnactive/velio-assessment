import type { NextFunction, Request, Response } from 'express';
import { claimInviteDto, createInviteDto } from './invite.dto.js';

/** HTTP-boundary validation shared by invite route handlers during incremental extraction. */
export class InviteController {
  validateCreate(request: Request, _response: Response, next: NextFunction) {
    try {
      createInviteDto.parse(request.body);
      next();
    } catch (error) {
      next(error);
    }
  }
  validateClaim(request: Request, _response: Response, next: NextFunction) {
    try {
      claimInviteDto.parse(request.body);
      next();
    } catch (error) {
      next(error);
    }
  }
}
