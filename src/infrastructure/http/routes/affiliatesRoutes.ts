import { Router } from 'express';
import { InMemoryAffiliateRepository } from '../../adapters/repositories/InMemoryAffiliateRepository';
import { requirePermission } from '../../auth/rbac';

const repo = new InMemoryAffiliateRepository();

export const affiliatesRouter = Router();

affiliatesRouter.post(
  '/affiliates',
  requirePermission('affiliate.manage'),
  async (req, res) => {
    const {
      merchantId,
      name,
      email,
      document,
      phone,
      commissionRate,
      active,
    } = req.body;
    const entity = await repo.createAffiliate({
      merchantId,
      name,
      email,
      document,
      phone,
      commissionRate: commissionRate || 10,
      active: active !== undefined ? active : true,
      updatedAt: new Date(),
    });
    res.json(entity);
  }
);

affiliatesRouter.get(
  '/affiliates',
  requirePermission('affiliate.manage'),
  async (req, res) => {
    const { merchantId } = req.query as { merchantId: string };
    const list = await repo.listAffiliates(merchantId);
    res.json(list);
  }
);

affiliatesRouter.post(
  '/affiliate-links',
  requirePermission('affiliate.manage'),
  async (req, res) => {
    const { affiliateId, productId, code, url } = req.body;
    const link = await repo.createLink({
      affiliateId,
      productId,
      code,
      url: url || `https://checkout.example.com/${code}`,
      clicks: 0,
      conversions: 0,
      active: true,
      updatedAt: new Date(),
    });
    res.json(link);
  }
);

affiliatesRouter.get(
  '/affiliate-links',
  requirePermission('affiliate.manage'),
  async (req, res) => {
    const { productId } = req.query as { productId: string };
    const list = await repo.listLinksByProduct(productId);
    res.json(list);
  }
);
