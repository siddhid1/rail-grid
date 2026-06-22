import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from './proxy.service.js';
@Controller()
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}
  @All('*')
  async all(@Req() req: Request, @Res() res: Response): Promise<void> {
    const result = await this.proxy.forward(req);
    for (const [key, value] of Object.entries(result.headers ?? {})) {
      if (!['connection', 'keep-alive', 'transfer-encoding', 'host'].includes(key.toLowerCase())) res.setHeader(key, value as any);
    }
    res.status(result.status).json(result.data);
  }
}
