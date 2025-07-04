import { cesc } from "@doenet/utils";

describe("SampleRandomNumbers Tag Tests", function () {
    beforeEach(() => {
        cy.clearIndexedDB();
        cy.visit("/");
    });

    it(`different numbers when reload page if don't save state`, () => {
        let doenetML = `
    <text name="a">a</text>
    <p name="p1"><repeatForSequence length="100">
      <sampleRandomNumbers />
    </repeatForSequence></p>
    `;

        cy.window().then(async (win) => {
            win.postMessage(
                {
                    doenetML,
                },
                "*",
            );
        });

        cy.get(cesc("#a")).should("have.text", "a"); //wait for page to load

        let samples = [];

        cy.window().then(async (win) => {
            let stateVariables = await win.returnAllStateVariables1();

            samples = stateVariables[
                await win.resolvePath1("p1")
            ].activeChildren.map(
                (x) => stateVariables[x.componentIdx].stateValues.value,
            );

            expect(samples.length).eq(100);

            for (let sample of samples) {
                expect(sample).gt(0);
                expect(sample).lte(1);
            }
        });

        cy.reload();

        cy.window().then(async (win) => {
            win.postMessage(
                {
                    doenetML,
                },
                "*",
            );
        });

        cy.get(cesc("#a")).should("have.text", "a"); //wait for page to load

        cy.window().then(async (win) => {
            let stateVariables = await win.returnAllStateVariables1();

            let samples2 = stateVariables[
                await win.resolvePath1("p1")
            ].activeChildren.map(
                (x) => stateVariables[x.componentIdx].stateValues.value,
            );

            expect(samples2.length).eq(100);

            for (let [ind, sample] of samples2.entries()) {
                expect(sample).gt(0);
                expect(sample).lte(1);
                expect(sample).not.eq(samples[ind]);
            }
        });
    });

    it("same numbers when reload if save state", () => {
        let doenetML = `
    <text>a</text>
    <text name="a">a</text>
    <p name="p1"><repeatForSequence length="100">
      <sampleRandomNumbers />
    </repeatForSequence></p>

    <booleanInput name="bi" /><boolean name="b2" extend="$bi" />

    `;

        cy.get("#testRunner_toggleControls").click();
        cy.get("#testRunner_allowLocalState").click();
        cy.wait(100);
        cy.get("#testRunner_toggleControls").click();

        cy.window().then(async (win) => {
            win.postMessage(
                {
                    doenetML,
                },
                "*",
            );
        });

        cy.get(cesc("#a")).should("have.text", "a"); //wait for page to load

        let samples = [];

        cy.window().then(async (win) => {
            let stateVariables = await win.returnAllStateVariables1();

            samples = stateVariables[
                await win.resolvePath1("p1")
            ].activeChildren.map(
                (x) => stateVariables[x.componentIdx].stateValues.value,
            );

            expect(samples.length).eq(100);

            for (let sample of samples) {
                expect(sample).gt(0);
                expect(sample).lte(1);
            }
        });

        cy.log("interact so changes will be saved to database");
        cy.get(cesc("#bi")).click();
        cy.get(cesc("#b2")).should("have.text", "true");

        cy.log("wait for debounce");
        cy.wait(1500);

        cy.reload();

        cy.window().then(async (win) => {
            win.postMessage(
                {
                    doenetML,
                },
                "*",
            );
        });

        cy.log("make sure core is up and running");
        cy.get(cesc("#bi")).click();
        cy.get(cesc("#b2")).should("have.text", "false");

        cy.log("check that values are unchanged");

        cy.window().then(async (win) => {
            let stateVariables = await win.returnAllStateVariables1();

            let samples2 = stateVariables[
                await win.resolvePath1("p1")
            ].activeChildren.map(
                (x) => stateVariables[x.componentIdx].stateValues.value,
            );

            expect(samples2).eqls(samples);
        });
    });
});
