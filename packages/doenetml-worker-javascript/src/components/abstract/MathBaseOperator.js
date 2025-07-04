import { returnRoundingStateVariableDefinitions } from "../../utils/rounding";
import MathComponent from "../Math";
import me from "math-expressions";

export default class MathOperator extends MathComponent {
    static componentType = "_mathOperator";
    static rendererType = "math";

    // since math operator treats each child a separate argument
    // composites with no replacement should be ignored.
    // turn off this flag set in math
    static descendantCompositesMustHaveAReplacement = false;

    static createAttributesObject() {
        let attributes = super.createAttributesObject();
        attributes.forceSymbolic = {
            createComponentOfType: "boolean",
            createStateVariable: "forceSymbolic",
            defaultValue: false,
            public: true,
        };
        attributes.forceNumeric = {
            createComponentOfType: "boolean",
            createStateVariable: "forceNumeric",
            defaultValue: false,
            public: true,
        };
        return attributes;
    }

    // Include children that can be added due to sugar
    static additionalSchemaChildren = ["string"];

    static returnSugarInstructions() {
        let sugarInstructions = super.returnSugarInstructions();

        let breakStringsIntoMathsBySpaces = function ({
            matchedChildren,
            nComponents,
        }) {
            // break any string by white space and wrap pieces with math or number

            let newChildren = matchedChildren.reduce(function (a, c) {
                if (typeof c === "string") {
                    return [
                        ...a,
                        ...c
                            .split(/\s+/)
                            .filter((s) => s)
                            .map((s) => ({
                                type: "serialized",
                                componentType: Number.isFinite(Number(s))
                                    ? "number"
                                    : "math",
                                componentIdx: nComponents++,
                                children: [s],
                                attributes: {},
                                doenetAttributes: {},
                                state: {},
                            })),
                    ];
                } else {
                    return [...a, c];
                }
            }, []);

            return {
                success: true,
                newChildren: newChildren,
                nComponents,
            };
        };

        sugarInstructions.push({
            replacementFunction: breakStringsIntoMathsBySpaces,
        });

        return sugarInstructions;
    }

    static returnChildGroups() {
        return [
            {
                group: "maths",
                componentTypes: ["math"],
            },
            {
                group: "numbers",
                componentTypes: ["number"],
            },
        ];
    }

    static returnStateVariableDefinitions() {
        let stateVariableDefinitions = super.returnStateVariableDefinitions();

        let roundingDefinitions = returnRoundingStateVariableDefinitions({
            childGroupsIfSingleMatch: ["maths", "numbers"],
        });
        Object.assign(stateVariableDefinitions, roundingDefinitions);

        stateVariableDefinitions.isNumericOperator = {
            returnDependencies: () => ({
                forceNumeric: {
                    dependencyType: "stateVariable",
                    variableName: "forceNumeric",
                },
                forceSymbolic: {
                    dependencyType: "stateVariable",
                    variableName: "forceSymbolic",
                },
                mathChildren: {
                    dependencyType: "child",
                    childGroups: ["maths"],
                    variableNames: ["isNumber"],
                    variablesOptional: true,
                },
                shadowSource: {
                    dependencyType: "shadowSource",
                    variableNames: ["isNumericOperator"],
                },
            }),
            definition({ dependencyValues }) {
                let isNumericOperator;
                if (dependencyValues.forceNumeric) {
                    isNumericOperator = true;
                } else if (dependencyValues.forceSymbolic) {
                    isNumericOperator = false;
                } else if (dependencyValues.mathChildren.length === 0) {
                    isNumericOperator =
                        dependencyValues.shadowSource?.stateValues
                            .isNumericOperator;
                    if (isNumericOperator === undefined) {
                        isNumericOperator = true;
                    }
                } else {
                    // have math children and aren't forced to be numeric or symbolic
                    // will be numeric only if have all math children are numbers
                    isNumericOperator = dependencyValues.mathChildren.every(
                        (x) => x.stateValues.isNumber,
                    );
                }

                return { setValue: { isNumericOperator } };
            },
        };

        delete stateVariableDefinitions.codePre;
        delete stateVariableDefinitions.expressionWithCodes;
        delete stateVariableDefinitions.mathChildrenFunctionSymbols;
        delete stateVariableDefinitions.codesAdjacentToStrings;
        delete stateVariableDefinitions.mathChildrenByVectorComponent;

        stateVariableDefinitions.mathOperator = {
            returnDependencies: () => ({}),
            definition: () => ({
                setValue: { mathOperator: (x) => me.fromAst("\uff3f") },
            }),
        };

        stateVariableDefinitions.numericOperator = {
            returnDependencies: () => ({}),
            definition: () => ({
                setValue: { numericOperator: (x) => me.fromAst("\uff3f") },
            }),
        };

        stateVariableDefinitions.inverseMathOperator = {
            returnDependencies: () => ({}),
            definition: () => ({ setValue: { inverseMathOperator: null } }),
        };

        stateVariableDefinitions.inverseNumericOperator = {
            returnDependencies: () => ({}),
            definition: () => ({ setValue: { inverseNumericOperator: null } }),
        };

        stateVariableDefinitions.unnormalizedValue = {
            returnDependencies: () => ({
                mathNumberChildren: {
                    dependencyType: "child",
                    childGroups: ["maths", "numbers"],
                    variableNames: ["value", "canBeModified"],
                },
                isNumericOperator: {
                    dependencyType: "stateVariable",
                    variableName: "isNumericOperator",
                },
                mathOperator: {
                    dependencyType: "stateVariable",
                    variableName: "mathOperator",
                },
                numericOperator: {
                    dependencyType: "stateVariable",
                    variableName: "numericOperator",
                },
                inverseMathOperator: {
                    dependencyType: "stateVariable",
                    variableName: "inverseMathOperator",
                },
                inverseNumericOperator: {
                    dependencyType: "stateVariable",
                    variableName: "inverseNumericOperator",
                },
            }),
            definition: function ({ dependencyValues, componentInfoObjects }) {
                if (dependencyValues.mathNumberChildren.length === 0) {
                    return {
                        setValue: { unnormalizedValue: me.fromAst("\uff3f") },
                    };
                } else if (dependencyValues.isNumericOperator) {
                    let inputs = [];
                    for (let child of dependencyValues.mathNumberChildren) {
                        if (
                            componentInfoObjects.isInheritedComponentType({
                                inheritedComponentType: child.componentType,
                                baseComponentType: "number",
                            })
                        ) {
                            inputs.push(child.stateValues.value);
                        } else {
                            // math
                            let value =
                                child.stateValues.value.evaluate_to_constant();
                            inputs.push(value);
                        }
                    }

                    return {
                        setValue: {
                            unnormalizedValue: me.fromAst(
                                dependencyValues.numericOperator(inputs),
                            ),
                        },
                    };
                } else {
                    let inputs = [];
                    for (let child of dependencyValues.mathNumberChildren) {
                        if (
                            componentInfoObjects.isInheritedComponentType({
                                inheritedComponentType: child.componentType,
                                baseComponentType: "number",
                            })
                        ) {
                            inputs.push(me.fromAst(child.stateValues.value));
                        } else {
                            // math
                            inputs.push(child.stateValues.value);
                        }
                    }

                    return {
                        setValue: {
                            unnormalizedValue:
                                dependencyValues.mathOperator(inputs),
                        },
                    };
                }
            },
            inverseDefinition: function ({
                desiredStateVariableValues,
                dependencyValues,
                componentInfoObjects,
            }) {
                if (dependencyValues.mathNumberChildren.length === 0) {
                    return { success: false };
                } else if (dependencyValues.isNumericOperator) {
                    if (dependencyValues.inverseNumericOperator) {
                        let inputs = [];
                        let canBeModified = [];
                        let inputToChildIndex = [];
                        for (let [
                            childInd,
                            child,
                        ] of dependencyValues.mathNumberChildren.entries()) {
                            if (
                                componentInfoObjects.isInheritedComponentType({
                                    inheritedComponentType: child.componentType,
                                    baseComponentType: "number",
                                })
                            ) {
                                inputs.push(child.stateValues.value);
                                canBeModified.push(
                                    child.stateValues.canBeModified,
                                );
                                inputToChildIndex.push(childInd);
                            } else {
                                // math
                                let value =
                                    child.stateValues.value.evaluate_to_constant();
                                inputs.push(value);
                                canBeModified.push(
                                    child.stateValues.canBeModified,
                                );
                                inputToChildIndex.push(childInd);
                            }
                        }
                        let results = dependencyValues.inverseNumericOperator({
                            desiredValue:
                                desiredStateVariableValues.unnormalizedValue.evaluate_to_constant(),
                            inputs,
                            canBeModified,
                            desiredMathValue:
                                desiredStateVariableValues.unnormalizedValue,
                        });

                        if (results.success) {
                            let childIndex =
                                inputToChildIndex[results.inputNumber];
                            if (Number.isFinite(childIndex)) {
                                let desiredValue = results.inputValue;

                                return {
                                    success: true,
                                    instructions: [
                                        {
                                            setDependency: "mathNumberChildren",
                                            desiredValue,
                                            childIndex,
                                            variableIndex: 0,
                                        },
                                    ],
                                };
                            } else {
                                return { success: false };
                            }
                        } else {
                            return { success: false };
                        }
                    } else {
                        return { success: false };
                    }
                } else if (dependencyValues.inverseMathOperator) {
                    let inputs = [];
                    let canBeModified = [];
                    let inputToChildIndex = [];
                    for (let [
                        childInd,
                        child,
                    ] of dependencyValues.mathNumberChildren.entries()) {
                        if (
                            componentInfoObjects.isInheritedComponentType({
                                inheritedComponentType: child.componentType,
                                baseComponentType: "number",
                            })
                        ) {
                            inputs.push(me.fromAst(child.stateValues.value));
                            canBeModified.push(child.stateValues.canBeModified);
                            inputToChildIndex.push(childInd);
                        } else {
                            // math
                            inputs.push(child.stateValues.value);
                            canBeModified.push(child.stateValues.canBeModified);
                            inputToChildIndex.push(childInd);
                        }
                    }

                    let results = dependencyValues.inverseMathOperator({
                        desiredValue:
                            desiredStateVariableValues.unnormalizedValue,
                        inputs,
                        canBeModified,
                    });

                    if (results.success) {
                        let childIndex = inputToChildIndex[results.inputNumber];
                        if (Number.isFinite(childIndex)) {
                            let desiredValue = results.inputValue;

                            return {
                                success: true,
                                instructions: [
                                    {
                                        setDependency: "mathNumberChildren",
                                        desiredValue,
                                        childIndex,
                                        variableIndex: 0,
                                    },
                                ],
                            };
                        } else {
                            return { success: false };
                        }
                    } else {
                        return { success: false };
                    }
                } else {
                    return { success: false };
                }
            },
        };

        // create new version on canBeModified that is true only if
        // there is just one child component that can be modified
        // and we have a inverseMathOperator/inverseNumberOperator
        stateVariableDefinitions.canBeModified = {
            returnDependencies: () => ({
                modifyIndirectly: {
                    dependencyType: "stateVariable",
                    variableName: "modifyIndirectly",
                },
                fixed: {
                    dependencyType: "stateVariable",
                    variableName: "fixed",
                },
                mathNumberChildren: {
                    dependencyType: "child",
                    childGroups: ["maths", "numbers"],
                    variableNames: ["canBeModified"],
                },
                isNumericOperator: {
                    dependencyType: "stateVariable",
                    variableName: "isNumericOperator",
                },
                inverseMathOperator: {
                    dependencyType: "stateVariable",
                    variableName: "mathOperator",
                },
                inverseNumericOperator: {
                    dependencyType: "stateVariable",
                    variableName: "inverseNumericOperator",
                },
            }),
            definition: function ({ dependencyValues }) {
                let canBeModified =
                    dependencyValues.modifyIndirectly &&
                    !dependencyValues.fixed &&
                    Boolean(
                        dependencyValues.isNumericOperator
                            ? dependencyValues.inverseNumericOperator
                            : dependencyValues.inverseMathOperator,
                    );

                if (canBeModified) {
                    // TODO: if there are no children, canBeModified may be incorrectly set to true
                    // But, we include this exception so that canBeModified is not set to false
                    // in macros, where children aren't copied
                    if (dependencyValues.mathNumberChildren.length > 0) {
                        let nModifiable =
                            dependencyValues.mathNumberChildren.filter(
                                (x) => x.stateValues.canBeModified,
                            ).length;

                        if (nModifiable !== 1) {
                            canBeModified = false;
                        }
                    }
                }

                return { setValue: { canBeModified } };
            },
        };

        return stateVariableDefinitions;
    }
}
