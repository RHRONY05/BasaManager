import type { Request, Response, NextFunction } from 'express';
import { getValidated } from '../../middleware/validate';
import type {
  CreateBuildingRequest,
  UpdateBuildingRequest,
  CreateUnitRequest,
  UpdateUnitRequest,
} from '@bm/shared/api/buildings';
import type { BuildingsService } from './buildings.service';

export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  listBuildings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.buildingsService.listBuildings(
        req.tenantCtx!,
        req.org!.membershipId,
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getBuilding = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.buildingsService.getBuilding(
        req.tenantCtx!,
        id!,
        req.org!.membershipId,
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  createBuilding = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<CreateBuildingRequest>(res, 'body') || req.body;
      const result = await this.buildingsService.createBuilding(req.tenantCtx!, data);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  updateBuilding = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data = getValidated<UpdateBuildingRequest>(res, 'body') || req.body;
      const result = await this.buildingsService.updateBuilding(req.tenantCtx!, id!, data);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  archiveBuilding = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.buildingsService.archiveBuilding(req.tenantCtx!, id!);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  listUnits = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.buildingsService.listUnits(
        req.tenantCtx!,
        id!,
        req.org!.membershipId,
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  createUnit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data = getValidated<CreateUnitRequest>(res, 'body') || req.body;
      const result = await this.buildingsService.createUnit(req.tenantCtx!, id!, data);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  updateUnit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data = getValidated<UpdateUnitRequest>(res, 'body') || req.body;
      const result = await this.buildingsService.updateUnit(req.tenantCtx!, id!, data);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  archiveUnit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await this.buildingsService.archiveUnit(req.tenantCtx!, id!);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
