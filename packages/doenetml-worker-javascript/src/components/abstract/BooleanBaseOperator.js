import BooleanComponent from "../Boolean";

export default class BooleanOperator extends BooleanComponent {
    static componentType = "_booleanOperator";
    static rendererType = "boolean";

    static descendantCompositesMustHaveAReplacement = false;

    // Include children that can be added due to sugar
    static additionalSchemaChildren = ["string"];

    static returnSugarInstructions() {
        let sugarInstructions = super.returnSugarInstructions();

        let breakStringsIntoBooleansBySpaces = function ({
            matchedChildren,
            nComponents,
        }) {
            // break any string by white space and wrap pieces with boolean

            let newChildren = matchedChildren.reduce(function (a, c) {
                if (typeof c === "string") {
                    return [
                        ...a,
                        ...c
                            .split(/\s+/)
                            .filter((s) => s)
                            .map((s) => ({
                                type: "serialized",
                                componentType: "boolean",
                                componentIdx: nComponents++,
                                attributes: {},
                                doenetAttributes: {},
                                state: {},
                                children: [s],
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
            replacementFunction: breakStringsIntoBooleansBySpaces,
        });

        return sugarInstructions;
    }

    static returnChildGroups() {
        return [
            {
                group: "booleans",
                componentTypes: ["boolean"],
            },
        ];
    }

    static returnStateVariableDefinitions() {
        let stateVariableDefinitions = super.returnStateVariableDefinitions();

        delete stateVariableDefinitions.parsedExpression;
        delete stateVariableDefinitions.mathChildrenByCode;

        let constructor = this;

        stateVariableDefinitions.value = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "boolean",
            },
            forRenderer: true,
            returnDependencies: () => ({
                booleanChildren: {
                    dependencyType: "child",
                    childGroups: ["booleans"],
                    variableNames: ["value"],
                },
            }),
            definition: function ({ dependencyValues }) {
                return {
                    setValue: {
                        value: constructor.applyBooleanOperator(
                            dependencyValues.booleanChildren.map(
                                (x) => x.stateValues.value,
                            ),
                        ),
                    },
                };
            },
        };

        return stateVariableDefinitions;
    }
}
