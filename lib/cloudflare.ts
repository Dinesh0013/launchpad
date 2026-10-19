import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function cfBase(): string {
  return `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`;
}

export class CloudflareError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public cfErrors: { code: number; message: string }[]
  ) {
    super(message);
    this.name = "CloudflareError";
  }
}

export function isMockMode(): boolean {
  return process.env.CLOUDFLARE_API_TOKEN === "your_cloudflare_api_token";
}

function cfHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}


export async function createCloudflareProject(
  projectName: string
): Promise<{ id: string; pagesSubdomain: string }> {
  if (isMockMode()) {
    console.warn("⚠️  Running in MOCK MODE — Cloudflare API not called");
    return { id: "mock-cf-id", pagesSubdomain: "mock-project" };
  }

  const res = await fetch(cfBase(), {
    method: "POST",
    headers: cfHeaders(),
    body: JSON.stringify({ name: projectName, production_branch: "main" }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('CF CREATE PROJECT FAILED:', {
      status: res.status,
      projectName: projectName,
      responseBody: errorBody,
    });
    throw new Error(
      `Cloudflare createProject failed (${res.status}): ${errorBody}`
    );
  }
  const result = (await res.json()) as {
    id: string;
    subdomain: string;
  };

  return { id: result.id, pagesSubdomain: result.subdomain };
}

export async function deployToCloudflare(
  projectName: string,
  files: { path: string; content: Buffer }[]
): Promise<{ deploymentId: string; url: string }> {
  if (isMockMode()) {
    return { deploymentId: 'mock-deployment-id', url: 'https://mock.pages.dev' };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-deploy-'));

  try {
    for (const file of files) {
      const filePath = path.join(tmpDir, file.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content);
    }

    const output = execSync(
      `npx wrangler pages deploy ${tmpDir} --project-name=${projectName} --branch=main`,
      {
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
          CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        },
        timeout: 120000,
        encoding: 'utf8',
      }
    );

    console.log('Wrangler output:', output);

    const urlMatch = output.match(/https:\/\/[^\s]+\.pages\.dev/);
    const url = urlMatch ? urlMatch[0] : `https://${projectName}.pages.dev`;

    return { deploymentId: projectName, url };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function addCustomDomain(
  projectName: string,
  domain: string
): Promise<boolean> {
  if (isMockMode()) {
    console.warn("⚠️  Running in MOCK MODE — Cloudflare API not called");
    return true;
  }

  try {
    const res = await fetch(`${cfBase()}/${projectName}/domains`, {
      method: "POST",
      headers: cfHeaders(),
      body: JSON.stringify({ name: domain }),
    });
    if (!res.ok) {
      const errorBody = await res.text();
      console.error('CF ADD DOMAIN FAILED:', {
        status: res.status,
        projectName: projectName,
        domain: domain,
        responseBody: errorBody,
      });
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
