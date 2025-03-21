import { createComponentInfoObjects } from "../../utils/componentInfoObjects";
import {
    addDocumentIfItsMissing,
    expandDoenetMLsToFullSerializedComponents,
} from "../../utils/expandDoenetML";
import Core from "../../Core";

type DoenetMLFlags = {
    showCorrectness: boolean;
    readOnly: boolean;
    solutionDisplayMode: string;
    showFeedback: boolean;
    showHints: boolean;
    allowLoadState: boolean;
    allowSaveState: boolean;
    allowLocalState: boolean;
    allowSaveEvents: boolean;
    autoSubmit: boolean;
};

type DoenetMLFlagsSubset = Partial<DoenetMLFlags>;

const defaultFlags: DoenetMLFlags = {
    showCorrectness: true,
    readOnly: false,
    solutionDisplayMode: "button",
    showFeedback: true,
    showHints: true,
    allowLoadState: false,
    allowSaveState: false,
    allowLocalState: false,
    allowSaveEvents: false,
    autoSubmit: false,
};

export async function createTestCore({
    doenetML,
    requestedVariantIndex = 1,
    flags: specifiedFlags = {},
    theme,
    initializeCounters = {},
}: {
    doenetML: string;
    requestedVariantIndex?: number;
    flags?: DoenetMLFlagsSubset;
    theme?: "dark" | "light";
    initializeCounters?: Record<string, number>;
}) {
    let componentInfoObjects = createComponentInfoObjects();

    let expandResult = await expandDoenetMLsToFullSerializedComponents({
        doenetMLs: [doenetML],
        componentInfoObjects,
    });

    const flags: DoenetMLFlags = { ...defaultFlags, ...specifiedFlags };

    let coreBaseArgs = {
        doenetML,
        serializedDocument: addDocumentIfItsMissing(
            expandResult.fullSerializedComponents[0],
        )[0],
        flags,
        allDoenetMLs: expandResult.allDoenetMLs,
        preliminaryErrors: expandResult.errors,
        preliminaryWarnings: expandResult.warnings,
        componentInfoObjects,
        activityId: "",
        cid: "",
        docId: "1",
        activityVariantIndex: 1,
        requestedVariant: null,
        requestedVariantIndex,
        initializeCounters,
        stateVariableChanges: "",
        coreId: "",
        theme,
    };

    let core = new Core(coreBaseArgs);
    await core.getInitializedPromise();

    return core;
}

export async function returnAllStateVariables(core: Core) {
    if (!core.components) {
        throw Error("No core or components");
    }

    type CompObj = {
        componentName: string;
        componentType: string;
        stateValues: any;
        activeChildren: any[];
        replacements: null | any[];
        replacementsToWithhold: null | number;
        replacementOf: any;
        sharedParameters: any;
    };
    let componentsObj: { [key: string]: CompObj } = {};
    for (let componentName in core.components) {
        let component = core.components[componentName];

        let compObj: CompObj = {
            componentName,
            componentType: component.componentType,
            stateValues: {},
            activeChildren: [],
            replacements: null,
            replacementsToWithhold: null,
            replacementOf: null,
            sharedParameters: null,
        };

        for (let vName in component.state) {
            if (
                [
                    "replacements",
                    "recursiveReplacements",
                    "fullRecursiveReplacements",
                ].includes(vName) &&
                core.componentInfoObjects.isCompositeComponent({
                    componentType: component.componentType,
                }) &&
                !component.isExpanded
            ) {
                // don't expand a composite to get these replacement state variables
                continue;
            }
            compObj.stateValues[vName] = await component.state[vName].value;
        }
        compObj.activeChildren = component.activeChildren.map((x) =>
            x.componentName
                ? {
                      componentName: x.componentName,
                      componentType: x.componentType,
                  }
                : x,
        );
        if (component.replacements) {
            compObj.replacements = component.replacements.map((x) =>
                x.componentName
                    ? {
                          componentName: x.componentName,
                          componentType: x.componentType,
                      }
                    : x,
            );
            if (component.replacementsToWithhold !== undefined) {
                compObj.replacementsToWithhold =
                    component.replacementsToWithhold;
            }
        }
        if (component.replacementOf) {
            compObj.replacementOf = component.replacementOf.componentName;
        }
        compObj.sharedParameters = component.sharedParameters;

        componentsObj[componentName] = compObj;
    }

    return componentsObj;
}
