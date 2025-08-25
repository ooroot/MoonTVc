/* eslint-disable @typescript-eslint/no-explicit-any,no-console */
import { getCacheTime, getConfig } from '@/lib/config';
import { searchFromApiStream } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const streamParam = searchParams.get('stream');
  const enableStream = streamParam !== '0'; // 默认开启流式

  const config = await getConfig();
  const apiSites = config.SourceConfig.filter((site) => !site.disabled);

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  if (!query) {
    // 空查询，明确不缓存
    return new Response(JSON.stringify({ results: [] }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  }

  // 安全写入与断连处理
  let shouldStop = false;
  const abortSignal = (request as any).signal as AbortSignal | undefined;
  abortSignal?.addEventListener('abort', () => {
    shouldStop = true;
    try {
      writer.close();
    } catch {
      // ignore
    }
  });

  const safeWrite = async (obj: unknown) => {
    if (shouldStop || abortSignal?.aborted) return false;
    try {
      await writer.write(encoder.encode(JSON.stringify(obj) + '\n'));
      return true;
    } catch {
      shouldStop = true;
      return false;
    }
  };

  // -------------------------
  // 非流式：并发
  // -------------------------
  if (!enableStream) {
    const tasks = apiSites.map(async (site) => {
      const siteResults: any[] = [];
      let hasResults = false;
      try {
        const generator = searchFromApiStream(site, query);
        for await (const pageResults of generator) {
          let filteredResults = pageResults;
          if (filteredResults.length !== 0) {
            hasResults = true;
          }
          if (!config.SiteConfig.DisableYellowFilter) {
            filteredResults = pageResults.filter((result) => {
              const typeName = result.type_name || '';
              return !yellowWords.some((word) => typeName.includes(word));
            });
          }
          if (hasResults && filteredResults.length === 0) {
            throw new Error('结果被过滤');
          }
          siteResults.push(...filteredResults);
        }
        if (!hasResults) {
          throw new Error('无搜索结果');
        }
        return { siteResults, failed: null };
      } catch (err: any) {
        return {
          siteResults: [],
          failed: { name: site.name, key: site.key, error: err.message || '未知的错误' },
        };
      }
    });

    const results = await Promise.all(tasks);
    const aggregatedResults = results.flatMap((r) => r.siteResults);
    const failedSources = results.filter((r) => r.failed).map((r) => r.failed);

    if (aggregatedResults.length === 0) {
      return new Response(JSON.stringify({ aggregatedResults, failedSources }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });
    } else {
      const cacheTime = await getCacheTime();
      return new Response(JSON.stringify({ aggregatedResults, failedSources }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `private, max-age=${cacheTime}`,
        },
      });
    }
  }

  // -------------------------
  // 流式：并发
  // -------------------------
  (async () => {
    const aggregatedResults: any[] = [];
    const failedSources: { name: string; key: string; error: string }[] = [];

    const tasks = apiSites.map(async (site) => {
      try {
        const generator = searchFromApiStream(site, query);
        let hasResults = false;

        for await (const pageResults of generator) {
          let filteredResults = pageResults;
          if (filteredResults.length !== 0) {
            hasResults = true;
          }
          if (!config.SiteConfig.DisableYellowFilter) {
            filteredResults = pageResults.filter((result) => {
              const typeName = result.type_name || '';
              return !yellowWords.some((word) => typeName.includes(word));
            });
          }

          if (hasResults && filteredResults.length === 0) {
            failedSources.push({ name: site.name, key: site.key, error: '结果被过滤' });
            await safeWrite({ failedSources });
            return;
          }

          aggregatedResults.push(...filteredResults);
          if (!(await safeWrite({ site: site.key, pageResults: filteredResults }))) {
            return;
          }
        }

        if (!hasResults) {
          failedSources.push({ name: site.name, key: site.key, error: '无搜索结果' });
          await safeWrite({ failedSources });
        }
      } catch (err: any) {
        console.warn(`搜索失败 ${site.name}:`, err.message);
        failedSources.push({ name: site.name, key: site.key, error: err.message || '未知的错误' });
        await safeWrite({ failedSources });
      }
    });

    // 等所有 site 跑完
    await Promise.allSettled(tasks);

    if (failedSources.length > 0) {
      await safeWrite({ failedSources });
    }
    await safeWrite({ aggregatedResults });

    try {
      await writer.close();
    } catch {
      // ignore
    }
  })();

  const cacheTime = await getCacheTime();
  return new Response(readable, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `private, max-age=${cacheTime}`,
    },
  });
}
