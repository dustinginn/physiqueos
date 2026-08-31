import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriorityCompletionSubmitButtonView } from "./PriorityCompletionForm.jsx";

const source = fs.readFileSync(new URL("./PriorityCompletionForm.jsx", import.meta.url), "utf8");

describe("Priority completion pending interaction", () => {
  it("renders visible pending feedback and disables the actual submit control", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PriorityCompletionSubmitButtonView, {
        label: "Foam Rolling",
        pending: true,
      }),
    );
    expect(markup).toContain("Completing…");
    expect(markup).toContain("disabled");
    expect(markup).toContain("Completing Foam Rolling");
  });

  it("binds form status inside the submitting form and exposes durable success locally", () => {
    expect(source).toContain("const { pending } = useFormStatus()");
    expect(source).toContain("<form action={formAction}");
    expect(source.indexOf("<form action={formAction}")).toBeLessThan(source.indexOf("<PriorityCompletionSubmitButton"));
    expect(source).toContain("completed={state?.ok === true}");
    expect(source).not.toContain("useRouter");
  });
});
