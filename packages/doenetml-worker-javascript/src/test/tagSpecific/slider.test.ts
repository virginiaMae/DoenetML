import { describe, expect, it, vi } from "vitest";
import { createTestCore } from "../utils/test-core";
import { updateMathInputValue } from "../utils/actions";
import { PublicDoenetMLCore } from "../../CoreWorker";

const Mock = vi.fn();
vi.stubGlobal("postMessage", Mock);
vi.mock("hyperformula");

async function changeValue({
    value,
    componentIdx,
    core,
}: {
    value: number | string;
    componentIdx: number;
    core: PublicDoenetMLCore;
}) {
    await core.requestAction({
        actionName: "changeValue",
        componentIdx,
        args: { value },
    });
}

describe("Slider tag tests", async () => {
    it("two number slider", async () => {
        let { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: `
  <slider name="s">
    <number>1</number>
    <number>2</number>
  </slider>
  <p>Value: <number name="sv">$s</number></p>
  `,
        });

        let stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.type,
        ).eqls("number");
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.items,
        ).eqls([1, 2]);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .firstItem,
        ).eqls(1);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .lastItem,
        ).eqls(2);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(1);

        // less than halfway, stays at 1
        await changeValue({
            value: 1.49,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(1);

        // more than halfway, goes to 2
        await changeValue({
            value: 1.51,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(1);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(2);

        // below one, goes to 1
        await changeValue({
            value: -5,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(1);

        // above 2, goes to 2
        await changeValue({
            value: 9,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(1);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(2);
    });

    it("no arguments, default to number slider from 0 to 10", async () => {
        let { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: `
  <slider name="s" />
  <p>Value: <number name="sv">$s</number></p>
  <p>Change value: <mathInput name="mi" bindValueTo="$s" /></p>

    `,
        });

        let stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.type,
        ).eqls("number");
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.items,
        ).eqls([]);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.from,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.to,
        ).eq(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.step,
        ).eq(1);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .firstItem,
        ).eqls(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .lastItem,
        ).eqls(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("sv")].stateValues.value,
        ).eq(0);

        // change to 1
        await changeValue({
            value: 1.4,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(1);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(1);
        expect(
            stateVariables[await resolvePathToNodeIdx("sv")].stateValues.value,
        ).eq(1);

        // change to 9
        await changeValue({
            value: 8.6,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(9);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(9);
        expect(
            stateVariables[await resolvePathToNodeIdx("sv")].stateValues.value,
        ).eq(9);

        // enter 2.5
        await updateMathInputValue({
            latex: "2.5",
            componentIdx: await resolvePathToNodeIdx("mi"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(3);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(3);
        expect(
            stateVariables[await resolvePathToNodeIdx("sv")].stateValues.value,
        ).eq(3);

        // enter -103.9
        await updateMathInputValue({
            latex: "-103.9",
            componentIdx: await resolvePathToNodeIdx("mi"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("sv")].stateValues.value,
        ).eq(0);

        // enter x, ignored
        await updateMathInputValue({
            latex: "x",
            componentIdx: await resolvePathToNodeIdx("mi"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("sv")].stateValues.value,
        ).eq(0);

        // set to maximum
        await changeValue({
            value: 20,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("sv")].stateValues.value,
        ).eq(10);
    });

    it("step 0.1", async () => {
        let { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: `
  <slider name="s" step="0.1" />
    `,
        });

        let stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.type,
        ).eqls("number");
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.items,
        ).eqls([]);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.from,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.to,
        ).eq(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.step,
        ).eq(0.1);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .firstItem,
        ).eqls(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .lastItem,
        ).eqls(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(0);

        // change to 1.4
        await changeValue({
            value: 1.44,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(14);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).closeTo(1.4, 1e-12);

        // change to 9.3
        await changeValue({
            value: 9.26,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(93);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).closeTo(9.3, 1e-12);
    });

    it("from 100 to 200", async () => {
        let { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: `
  <slider name="s" from="100" to="200" />
    `,
        });

        let stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.type,
        ).eqls("number");
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.items,
        ).eqls([]);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.from,
        ).eq(100);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.to,
        ).eq(200);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.step,
        ).eq(1);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .firstItem,
        ).eqls(100);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .lastItem,
        ).eqls(200);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(100);

        // change to 137
        await changeValue({
            value: 136.8,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(37);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(137);

        // change to 199
        await changeValue({
            value: 199.1,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(99);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(199);
    });

    it("initial value", async () => {
        let { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: `
  <slider name="s" initialValue="7" />
    `,
        });

        let stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.type,
        ).eqls("number");
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.items,
        ).eqls([]);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.from,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.to,
        ).eq(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.step,
        ).eq(1);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .firstItem,
        ).eqls(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .lastItem,
        ).eqls(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(7);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(7);

        // change to 3
        await changeValue({
            value: 2.8,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(3);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(3);
    });

    it("bind value to", async () => {
        let { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: `
  <mathInput name="mi0" />
  <slider name="s" bindValueTo="$mi0" />
  <mathInput name="mi" bindValueTo="$s" />
    `,
        });

        let stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.type,
        ).eqls("number");
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.items,
        ).eqls([]);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.from,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.to,
        ).eq(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.step,
        ).eq(1);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .firstItem,
        ).eqls(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues
                .lastItem,
        ).eqls(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi0")].stateValues.value
                .tree,
        ).eq("\uff3f");
        expect(
            stateVariables[await resolvePathToNodeIdx("mi")].stateValues.value
                .tree,
        ).eq(0);

        // change to 3
        await changeValue({
            value: 2.8,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(3);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(3);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi0")].stateValues.value
                .tree,
        ).eq(3);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi")].stateValues.value
                .tree,
        ).eq(3);

        // enter 4.2 in post math input
        await updateMathInputValue({
            latex: "4.2",
            componentIdx: await resolvePathToNodeIdx("mi"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(4);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(4);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi0")].stateValues.value
                .tree,
        ).eq(4);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi")].stateValues.value
                .tree,
        ).eq(4);

        // enter 8.7 in pre math input
        await updateMathInputValue({
            latex: "8.7",
            componentIdx: await resolvePathToNodeIdx("mi0"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(9);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(9);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi0")].stateValues.value
                .tree,
        ).eq(8.7);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi")].stateValues.value
                .tree,
        ).eq(9);

        // enter x in pre math input
        await updateMathInputValue({
            latex: "x",
            componentIdx: await resolvePathToNodeIdx("mi0"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi0")].stateValues.value
                .tree,
        ).eq("x");
        expect(
            stateVariables[await resolvePathToNodeIdx("mi")].stateValues.value
                .tree,
        ).eq(0);

        // change to 5
        await changeValue({
            value: 5.3,
            componentIdx: await resolvePathToNodeIdx("s"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(5);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(5);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi0")].stateValues.value
                .tree,
        ).eq(5);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi")].stateValues.value
                .tree,
        ).eq(5);

        // enter y in post math input, ignored
        await updateMathInputValue({
            latex: "y",
            componentIdx: await resolvePathToNodeIdx("mi"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(5);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(5);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi0")].stateValues.value
                .tree,
        ).eq(5);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi")].stateValues.value
                .tree,
        ).eq(5);

        // enter 9999 in pre math input
        await updateMathInputValue({
            latex: "999",
            componentIdx: await resolvePathToNodeIdx("mi0"),
            core,
        });
        stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.index,
        ).eq(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(10);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi0")].stateValues.value
                .tree,
        ).eq(999);
        expect(
            stateVariables[await resolvePathToNodeIdx("mi")].stateValues.value
                .tree,
        ).eq(10);
    });

    it("label with math", async () => {
        let { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: `
  <slider name="s"><label>Hello <m>x^2</m></label></slider>
    `,
        });

        let stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.value,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("s")].stateValues.label,
        ).eq("Hello \\(x^2\\)");
    });

    it("label is name", async () => {
        let { core, resolvePathToNodeIdx } = await createTestCore({
            doenetML: `
  <slider name="mySlider" labelIsName />
    `,
        });

        let stateVariables = await core.returnAllStateVariables(false, true);
        expect(
            stateVariables[await resolvePathToNodeIdx("mySlider")].stateValues
                .value,
        ).eq(0);
        expect(
            stateVariables[await resolvePathToNodeIdx("mySlider")].stateValues
                .label,
        ).eq("my slider");
    });
});
