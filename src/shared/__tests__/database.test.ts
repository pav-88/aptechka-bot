import { describe, it, expect, vi } from 'vitest';

// Mock PrismaClient to avoid needing a real DB or generated client
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  })),
}));

describe('database', () => {
  it('should export prisma instance', async () => {
    const { prisma } = await import('../database');
    expect(prisma).toBeDefined();
    expect(typeof prisma).toBe('object');
  });

  it('should export connectDatabase function', async () => {
    const { connectDatabase } = await import('../database');
    expect(typeof connectDatabase).toBe('function');
  });

  it('should export disconnectDatabase function', async () => {
    const { disconnectDatabase } = await import('../database');
    expect(typeof disconnectDatabase).toBe('function');
  });

  it('connectDatabase should call $connect', async () => {
    const { connectDatabase, prisma } = await import('../database');
    await connectDatabase();
    expect(prisma.$connect).toHaveBeenCalled();
  });

  it('disconnectDatabase should call $disconnect', async () => {
    const { disconnectDatabase, prisma } = await import('../database');
    await disconnectDatabase();
    expect(prisma.$disconnect).toHaveBeenCalled();
  });
});