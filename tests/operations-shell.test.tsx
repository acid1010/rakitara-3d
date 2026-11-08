import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace() {}, push() {} }),
  usePathname: () => "/",
}));

const { default: OperationsLayout } =
  await import("../app/(operations)/layout");
const { default: ProductionRoute } = await import("../app/(operations)/page");

test("the operations layout renders its route segment before the session loads", () => {
  let rendered = false;
  function Segment() {
    rendered = true;
    return <p>Route segment rendered</p>;
  }

  const html = renderToStaticMarkup(
    <OperationsLayout>
      <Segment />
    </OperationsLayout>,
  );

  expect(rendered).toBe(true);
  expect(html).toContain("Route segment rendered");
  expect(html).toContain('aria-label="Main navigation"');
});

test("the production shell paints without exposing private page content", () => {
  const html = renderToStaticMarkup(
    <OperationsLayout>
      <ProductionRoute />
    </OperationsLayout>,
  );

  expect(html).toContain('aria-label="Main navigation"');
  expect(html).toContain("Loading your workspace");
  expect(html).not.toContain("The print beds are clear");
  expect(html).not.toContain("On the print bed");
});

for (const name of [
  "materials",
  "products",
  "printers",
  "sales",
  "purchases",
  "maintenance",
  "adjustments",
  "movements",
  "journal",
  "settings",
]) {
  const { default: Route } = await import(`../app/(operations)/${name}/page`);
  test(`${name} keeps its private content behind the page-level guard`, () => {
    const html = renderToStaticMarkup(
      <OperationsLayout>
        <Route />
      </OperationsLayout>,
    );

    expect(html).toContain('aria-label="Main navigation"');
    expect(html).toContain("Loading your workspace");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<form");
  });
}
