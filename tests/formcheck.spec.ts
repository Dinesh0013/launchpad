/**
 * Unit tests for lib/formcheck.ts — detectBackendForm.
 * No browser, no network.
 */
import { test, expect } from "@playwright/test";
import { detectBackendForm } from "../lib/formcheck";

test.describe("detectBackendForm", () => {
  test("no form → risk=none", () => {
    const html = `
      <!DOCTYPE html><html><body>
        <h1>Hello world</h1>
        <p>Contact us at <a href="tel:+1234567890">call us</a></p>
      </body></html>
    `;
    const result = detectBackendForm(html);
    expect(result.hasForm).toBe(false);
    expect(result.risk).toBe("none");
  });

  test("form with tel: action → risk=external", () => {
    const html = `
      <!DOCTYPE html><html><body>
        <form action="tel:+1234567890">
          <button type="submit">Call us</button>
        </form>
      </body></html>
    `;
    const result = detectBackendForm(html);
    expect(result.hasForm).toBe(true);
    expect(result.risk).toBe("external");
  });

  test("form with Calendly action → risk=external", () => {
    const html = `
      <!DOCTYPE html><html><body>
        <form action="https://calendly.com/user/meeting">
          <button type="submit">Book meeting</button>
        </form>
      </body></html>
    `;
    const result = detectBackendForm(html);
    expect(result.hasForm).toBe(true);
    expect(result.risk).toBe("external");
  });

  test("form posting to /api/book → risk=backend", () => {
    const html = `
      <!DOCTYPE html><html><body>
        <form action="/api/book" method="POST">
          <input name="name" />
          <button type="submit">Submit</button>
        </form>
      </body></html>
    `;
    const result = detectBackendForm(html);
    expect(result.hasForm).toBe(true);
    expect(result.risk).toBe("backend");
  });

  test("form with no action attribute → risk=backend (posts to current page)", () => {
    const html = `<form><input name="email"/><button>Submit</button></form>`;
    const result = detectBackendForm(html);
    expect(result.hasForm).toBe(true);
    expect(result.risk).toBe("backend");
  });

  test("form with relative action → risk=backend", () => {
    const html = `<form action="submit-handler"><button>Go</button></form>`;
    const result = detectBackendForm(html);
    expect(result.risk).toBe("backend");
  });

  test("JS asset with supabase reference → risk=backend even with external action", () => {
    const html = `<form action="https://example.com/handler"><button>Submit</button></form>`;
    const js = `const client = createClient(url, key); /* supabase */`;
    const result = detectBackendForm(html, [js]);
    expect(result.risk).toBe("backend");
  });

  test("JS asset with fetch('/api ...) → risk=backend", () => {
    const html = `<form action="https://formspree.io/f/abc"><button>Submit</button></form>`;
    const js = `fetch('/api/submit', { method: 'POST', body: JSON.stringify(data) })`;
    const result = detectBackendForm(html, [js]);
    expect(result.risk).toBe("backend");
  });
});
