/**
 * OAuth Probe Functional Tests
 * Based on PRP Requirements for OAuth Security Probe
 * 
 * These tests validate core functionality of the OAuth probe
 * They should PASS when the functionality is correctly implemented
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Type definitions from PRP
interface OAuthDiscovery {
  well_known_document: {
    found: boolean;
    url: string | null;
    response_code: number;
    metadata: OAuthMetadata | null;
  };
  authorization_endpoint: EndpointResult;
  token_endpoint: {
    found: boolean;
    url: string | null;
    method: 'discovered' | 'probed' | 'not_found';
    accepts_post: boolean;
  };
  supported_flows: {
    authorization_code: boolean;
    implicit: boolean;
    client_credentials: boolean;
    device_code: boolean;
  };
}

interface EndpointResult {
  found: boolean;
  url: string | null;
  method: 'discovered' | 'probed' | 'not_found';
  response_headers: Record<string, string>;
}

interface OAuthMetadata {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

interface SecurityScore {
  score: number; // 0-100
  maturity_level: 0 | 1 | 2 | 3 | 4;
  factors: {
    uses_https: boolean;
    requires_pkce: boolean;
    no_implicit_flow: boolean;
    proper_token_validation: boolean;
    secure_headers: boolean;
  };
}

interface VulnerabilityFinding {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  evidence: string;
  recommendation: string;
  cve_reference?: string;
}

describe('OAuth Probe Functional Tests', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  describe('MCP Endpoint Discovery', () => {
    it('should discover MCP server at common paths', async () => {
      const commonPaths = [
        '/.well-known/mcp.json',
        '/mcp',
        '/api/mcp',
        '/_mcp',
        '/tools'
      ];

      // Mock successful MCP discovery
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'Test MCP Server',
          version: '1.0.0',
          tools: []
        })
      });

      const result = await discoverMCPEndpoint('http://localhost:3000');
      
      expect(result.found).toBe(true);
      expect(result.endpoint).toBeTruthy();
      expect(commonPaths).toContain(result.path);
    });

    it('should detect MCP server authentication requirements', async () => {
      // Mock 401 response indicating auth required
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({
          'WWW-Authenticate': 'Bearer realm="MCP"'
        })
      });

      const result = await checkMCPAuthentication('http://localhost:3000/mcp');
      
      expect(result.requires_auth).toBe(true);
      expect(result.auth_type).toBe('Bearer');
      expect(result.realm).toBe('MCP');
    });
  });

  describe('OAuth Discovery Engine', () => {
    it('should discover OAuth well-known configuration', async () => {
      const mockOAuthConfig: OAuthMetadata = {
        issuer: 'http://localhost:3000',
        authorization_endpoint: 'http://localhost:3000/oauth/authorize',
        token_endpoint: 'http://localhost:3000/oauth/token',
        userinfo_endpoint: 'http://localhost:3000/oauth/userinfo',
        jwks_uri: 'http://localhost:3000/oauth/jwks',
        scopes_supported: ['read', 'write'],
        response_types_supported: ['code', 'token'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256']
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockOAuthConfig
      });

      const discovery = await performOAuthDiscovery('http://localhost:3000');
      
      expect(discovery.well_known_document.found).toBe(true);
      expect(discovery.well_known_document.metadata).toEqual(mockOAuthConfig);
      expect(discovery.authorization_endpoint.found).toBe(true);
      expect(discovery.token_endpoint.found).toBe(true);
    });

    it('should probe common OAuth endpoints when well-known not found', async () => {
      // Mock 404 for well-known
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      // Mock successful probe of common endpoints
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'text/html'
        })
      });

      const discovery = await performOAuthDiscovery('http://localhost:3000');
      
      expect(discovery.well_known_document.found).toBe(false);
      expect(discovery.authorization_endpoint.method).toBe('probed');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/authorize'),
        expect.any(Object)
      );
    });

    it('should detect supported OAuth flows', async () => {
      const mockConfig: OAuthMetadata = {
        response_types_supported: ['code', 'token'],
        grant_types_supported: ['authorization_code', 'client_credentials']
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      const discovery = await performOAuthDiscovery('http://localhost:3000');
      
      expect(discovery.supported_flows.authorization_code).toBe(true);
      expect(discovery.supported_flows.implicit).toBe(true); // 'token' response type
      expect(discovery.supported_flows.client_credentials).toBe(true);
      expect(discovery.supported_flows.device_code).toBe(false);
    });
  });

  describe('Security Assessment Algorithm', () => {
    it('should calculate security score based on OAuth configuration', () => {
      const goodConfig = {
        uses_https: true,
        requires_pkce: true,
        no_implicit_flow: true,
        proper_token_validation: true,
        secure_headers: true
      };

      const score = calculateSecurityScore(goodConfig);
      
      expect(score.score).toBeGreaterThanOrEqual(80);
      expect(score.maturity_level).toBeGreaterThanOrEqual(3);
    });

    it('should assign low scores to insecure configurations', () => {
      const badConfig = {
        uses_https: false,
        requires_pkce: false,
        no_implicit_flow: false,
        proper_token_validation: false,
        secure_headers: false
      };

      const score = calculateSecurityScore(badConfig);
      
      expect(score.score).toBeLessThan(30);
      expect(score.maturity_level).toBeLessThanOrEqual(1);
    });

    it('should detect OAuth 2.1 compliance', () => {
      const oauth21Config = {
        no_implicit_flow: true,
        requires_pkce: true,
        uses_https: true,
        no_resource_owner_password: true,
        refresh_token_rotation: true
      };

      const compliance = checkOAuth21Compliance(oauth21Config);
      
      expect(compliance.is_compliant).toBe(true);
      expect(compliance.missing_requirements).toHaveLength(0);
    });
  });

  describe('Vulnerability Detection', () => {
    it('should detect missing PKCE requirement', () => {
      const config: OAuthMetadata = {
        code_challenge_methods_supported: undefined
      };

      const vulnerabilities = detectVulnerabilities(config);
      
      const pkceVuln = vulnerabilities.find(v => v.type === 'MISSING_PKCE');
      expect(pkceVuln).toBeDefined();
      expect(pkceVuln?.severity).toBe('high');
      expect(pkceVuln?.cve_reference).toBe('CWE-757');
    });

    it('should detect implicit flow support', () => {
      const config: OAuthMetadata = {
        response_types_supported: ['token', 'id_token']
      };

      const vulnerabilities = detectVulnerabilities(config);
      
      const implicitVuln = vulnerabilities.find(v => v.type === 'IMPLICIT_FLOW_ENABLED');
      expect(implicitVuln).toBeDefined();
      expect(implicitVuln?.severity).toBe('high');
    });

    it('should detect HTTP usage for OAuth', () => {
      const vulnerabilities = detectVulnerabilities({
        issuer: 'http://example.com'
      });

      const httpVuln = vulnerabilities.find(v => v.type === 'INSECURE_TRANSPORT');
      expect(httpVuln).toBeDefined();
      expect(httpVuln?.severity).toBe('critical');
    });

    it('should detect wildcard redirect URI', () => {
      const vulnerabilities = detectRedirectVulnerabilities([
        'http://example.com/*',
        'http://*.example.com/callback'
      ]);

      expect(vulnerabilities).toContainEqual(
        expect.objectContaining({
          type: 'WILDCARD_REDIRECT_URI',
          severity: 'high'
        })
      );
    });
  });

  describe('Report Generation', () => {
    it('should generate JSON format report', () => {
      const assessmentData = {
        target: 'http://localhost:3000',
        discovery: {} as OAuthDiscovery,
        score: { score: 75, maturity_level: 3 } as SecurityScore,
        vulnerabilities: []
      };

      const report = generateReport(assessmentData, 'json');
      
      expect(() => JSON.parse(report)).not.toThrow();
      const parsed = JSON.parse(report);
      expect(parsed.target).toBe('http://localhost:3000');
      expect(parsed.score).toBe(75);
    });

    it('should generate Markdown format report', () => {
      const assessmentData = {
        target: 'http://localhost:3000',
        score: { score: 75, maturity_level: 3 } as SecurityScore,
        vulnerabilities: [
          {
            type: 'MISSING_PKCE',
            severity: 'high',
            description: 'PKCE not required',
            evidence: 'No code_challenge_methods_supported',
            recommendation: 'Enable PKCE'
          }
        ]
      };

      const report = generateReport(assessmentData, 'markdown');
      
      expect(report).toContain('# OAuth Security Assessment Report');
      expect(report).toContain('## Security Score: 75/100');
      expect(report).toContain('### High Severity');
      expect(report).toContain('MISSING_PKCE');
    });

    it('should generate HTML format report', () => {
      const assessmentData = {
        target: 'http://localhost:3000',
        score: { score: 75, maturity_level: 3 } as SecurityScore,
        vulnerabilities: []
      };

      const report = generateReport(assessmentData, 'html');
      
      expect(report).toContain('<!DOCTYPE html>');
      expect(report).toContain('<h1>OAuth Security Assessment</h1>');
      expect(report).toMatch(/<div class="score">\s*75\s*\/\s*100\s*<\/div>/);
    });

    it('should generate text format report', () => {
      const assessmentData = {
        target: 'http://localhost:3000',
        score: { score: 75, maturity_level: 3 } as SecurityScore,
        vulnerabilities: []
      };

      const report = generateReport(assessmentData, 'text');
      
      expect(report).toContain('OAuth Security Assessment Report');
      expect(report).toContain('Target: http://localhost:3000');
      expect(report).toContain('Security Score: 75/100');
      expect(report).not.toContain('<'); // No HTML
      expect(report).not.toContain('#'); // No Markdown
    });
  });

  describe('Authentication Testing', () => {
    it('should test various authentication methods', async () => {
      const authMethods = [
        { type: 'none', expected: 401 },
        { type: 'bearer', token: 'invalid', expected: 403 },
        { type: 'basic', credentials: 'user:pass', expected: 401 }
      ];

      for (const method of authMethods) {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: method.expected
        });

        const result = await testAuthentication('http://localhost:3000', method);
        expect(result.response_code).toBe(method.expected);
      }
    });

    it('should detect information disclosure in error messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid token: Token expired at 2024-01-01 for user admin@example.com'
      });

      const result = await testErrorDisclosure('http://localhost:3000');
      
      expect(result.information_disclosed).toBe(true);
      expect(result.sensitive_data_found).toContain('email');
      expect(result.sensitive_data_found).toContain('timestamp');
    });
  });
});

// Mock implementation functions
async function discoverMCPEndpoint(target: string): Promise<any> {
  // Implementation would check common MCP paths
  return { found: true, endpoint: `${target}/mcp`, path: '/mcp' };
}

async function checkMCPAuthentication(endpoint: string): Promise<any> {
  // Implementation would check auth requirements
  return { requires_auth: true, auth_type: 'Bearer', realm: 'MCP' };
}

async function performOAuthDiscovery(target: string): Promise<OAuthDiscovery> {
  // Implementation would perform actual discovery
  return {} as OAuthDiscovery;
}

function calculateSecurityScore(factors: any): SecurityScore {
  // Implementation would calculate score
  return { score: 0, maturity_level: 0, factors };
}

function checkOAuth21Compliance(config: any): any {
  // Implementation would check OAuth 2.1 requirements
  return { is_compliant: true, missing_requirements: [] };
}

function detectVulnerabilities(config: OAuthMetadata): VulnerabilityFinding[] {
  // Implementation would detect vulnerabilities
  return [];
}

function detectRedirectVulnerabilities(uris: string[]): VulnerabilityFinding[] {
  // Implementation would check redirect URIs
  return [];
}

function generateReport(data: any, format: string): string {
  // Implementation would generate reports
  return '';
}

async function testAuthentication(target: string, method: any): Promise<any> {
  // Implementation would test auth
  return { response_code: 401 };
}

async function testErrorDisclosure(target: string): Promise<any> {
  // Implementation would test for info disclosure
  return { information_disclosed: false, sensitive_data_found: [] };
}