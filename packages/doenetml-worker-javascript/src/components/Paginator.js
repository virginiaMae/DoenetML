import BlockComponent from "./abstract/BlockComponent";

export class Paginator extends BlockComponent {
    constructor(args) {
        super(args);

        Object.assign(this.actions, {
            setPage: this.setPage.bind(this),
            recordVisibilityChange: this.recordVisibilityChange.bind(this),
        });
    }
    static componentType = "paginator";
    static rendererType = "containerBlock";
    static renderChildren = true;
    static canDisplayChildErrors = true;

    static createAttributesObject() {
        let attributes = super.createAttributesObject();

        attributes.initialPage = {
            createComponentOfType: "integer",
            createStateVariable: "initialPage",
            defaultValue: 1,
        };
        return attributes;
    }

    static returnChildGroups() {
        return [
            {
                group: "anything",
                componentTypes: ["_base"],
            },
        ];
    }

    static returnStateVariableDefinitions() {
        let stateVariableDefinitions = super.returnStateVariableDefinitions();

        stateVariableDefinitions.numPages = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "integer",
            },
            returnDependencies: () => ({
                children: {
                    dependencyType: "child",
                    childGroups: ["anything"],
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: { numPages: dependencyValues.children.length },
                };
            },
        };

        stateVariableDefinitions.currentPage = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "integer",
            },
            hasEssential: true,
            returnDependencies: () => ({
                initialPage: {
                    dependencyType: "stateVariable",
                    variableName: "initialPage",
                },
                numPages: {
                    dependencyType: "stateVariable",
                    variableName: "numPages",
                },
            }),
            definition({ dependencyValues }) {
                return {
                    useEssentialOrDefaultValue: {
                        currentPage: {
                            get defaultValue() {
                                let initialPageNumber =
                                    dependencyValues.initialPage;
                                if (!Number.isInteger(initialPageNumber)) {
                                    return 1;
                                } else {
                                    return Math.max(
                                        1,
                                        Math.min(
                                            dependencyValues.numPages,
                                            initialPageNumber,
                                        ),
                                    );
                                }
                            },
                        },
                    },
                };
            },
            async inverseDefinition({
                desiredStateVariableValues,
                stateValues,
                sourceDetails = {},
            }) {
                // allow change only from setPage action
                if (!sourceDetails.fromSetPage) {
                    return { success: false };
                }

                let desiredPageNumber = Number(
                    desiredStateVariableValues.currentPage,
                );
                if (!Number.isInteger(desiredPageNumber)) {
                    return { success: false };
                }

                desiredPageNumber = Math.max(
                    1,
                    Math.min(await stateValues.numPages, desiredPageNumber),
                );

                return {
                    success: true,
                    instructions: [
                        {
                            setEssentialValue: "currentPage",
                            value: desiredPageNumber,
                        },
                    ],
                };
            },
        };

        stateVariableDefinitions.childIndicesToRender = {
            returnDependencies: () => ({
                currentPage: {
                    dependencyType: "stateVariable",
                    variableName: "currentPage",
                },
            }),
            definition({ dependencyValues }) {
                return {
                    setValue: {
                        childIndicesToRender: [
                            dependencyValues.currentPage - 1,
                        ],
                    },
                };
            },
            markStale: () => ({ updateRenderedChildren: true }),
        };

        return stateVariableDefinitions;
    }

    async setPage({
        number,
        actionId,
        sourceInformation = {},
        skipRendererUpdate = false,
    }) {
        if (!Number.isInteger(number)) {
            return;
        }

        let pageNumber = Math.max(
            1,
            Math.min(await this.stateValues.numPages, number),
        );

        let updateInstructions = [
            {
                updateType: "updateValue",
                componentIdx: this.componentIdx,
                stateVariable: "currentPage",
                value: pageNumber,
                sourceDetails: { fromSetPage: true },
            },
        ];

        await this.coreFunctions.performUpdate({
            updateInstructions,
            actionId,
            sourceInformation,
            skipRendererUpdate,
            overrideReadOnly: true,
            event: {
                verb: "selected",
                object: {
                    componentIdx: this.componentIdx,
                    componentType: this.componentType,
                },
                result: {
                    response: pageNumber,
                    responseText: pageNumber.toString(),
                },
            },
        });
    }

    recordVisibilityChange({ isVisible }) {
        this.coreFunctions.requestRecordEvent({
            verb: "visibilityChanged",
            object: {
                componentIdx: this.componentIdx,
                componentType: this.componentType,
            },
            result: { isVisible },
        });
    }
}

export class PaginatorControls extends BlockComponent {
    constructor(args) {
        super(args);

        this.externalActions = {};

        //Complex because the stateValues isn't defined until later
        Object.defineProperty(this.externalActions, "setPage", {
            enumerable: true,
            get: async function () {
                let paginatorComponentIdx =
                    await this.stateValues.paginatorComponentIdx;
                if (paginatorComponentIdx) {
                    return {
                        componentIdx: paginatorComponentIdx,
                        actionName: "setPage",
                    };
                } else {
                    return;
                }
            }.bind(this),
        });
    }
    static componentType = "paginatorControls";
    static renderChildren = true;

    static createAttributesObject() {
        let attributes = super.createAttributesObject();

        attributes.previousLabel = {
            createComponentOfType: "text",
            createStateVariable: "previousLabel",
            defaultValue: "Previous",
            forRenderer: true,
            public: true,
        };
        attributes.nextLabel = {
            createComponentOfType: "text",
            createStateVariable: "nextLabel",
            defaultValue: "Next",
            forRenderer: true,
            public: true,
        };
        attributes.pageLabel = {
            createComponentOfType: "text",
            createStateVariable: "pageLabel",
            defaultValue: "Page",
            forRenderer: true,
            public: true,
        };
        attributes.paginator = {
            createReferences: true,
        };

        return attributes;
    }

    static returnStateVariableDefinitions() {
        let stateVariableDefinitions = super.returnStateVariableDefinitions();

        stateVariableDefinitions.paginatorComponentIdx = {
            additionalStateVariablesDefined: ["unresolvedPath"],
            returnDependencies: () => ({
                paginator: {
                    dependencyType: "attributeRefResolutions",
                    attributeName: "paginator",
                },
            }),
            definition({ dependencyValues }) {
                if (dependencyValues.paginator?.length === 1) {
                    const paginator = dependencyValues.paginator[0];

                    if (paginator.unresolvedPath == null) {
                        return {
                            setValue: {
                                paginatorComponentIdx: paginator.componentIdx,
                                unresolvedPath: paginator.unresolvedPath,
                            },
                        };
                    }
                }
                return {
                    setValue: {
                        paginatorComponentIdx: null,
                        unresolvedPath: null,
                    },
                };
            },
        };

        stateVariableDefinitions.currentPage = {
            forRenderer: true,
            stateVariablesDeterminingDependencies: ["paginatorComponentIdx"],
            returnDependencies({ stateValues }) {
                if (!stateValues.paginatorComponentIdx) {
                    return {};
                } else {
                    return {
                        paginatorPage: {
                            dependencyType: "stateVariable",
                            componentIdx: stateValues.paginatorComponentIdx,
                            variableName: "currentPage",
                        },
                    };
                }
            },
            definition({ dependencyValues }) {
                console.log("current page", dependencyValues);
                if ("paginatorPage" in dependencyValues) {
                    return {
                        setValue: {
                            currentPage: dependencyValues.paginatorPage,
                        },
                    };
                } else {
                    return { setValue: { currentPage: 1 } };
                }
            },
        };

        stateVariableDefinitions.numPages = {
            forRenderer: true,
            stateVariablesDeterminingDependencies: ["paginatorComponentIdx"],
            returnDependencies({ stateValues }) {
                if (!stateValues.paginatorComponentIdx) {
                    return {};
                } else {
                    return {
                        paginatorNPages: {
                            dependencyType: "stateVariable",
                            componentIdx: stateValues.paginatorComponentIdx,
                            variableName: "numPages",
                        },
                    };
                }
            },
            definition({ dependencyValues }) {
                console.log("num pages", dependencyValues);
                if ("paginatorNPages" in dependencyValues) {
                    return {
                        setValue: {
                            numPages: dependencyValues.paginatorNPages,
                        },
                    };
                } else {
                    return { setValue: { numPages: 1 } };
                }
            },
        };

        // disabledDirectly for paginatorControls is not affected by the readOnly flag
        // nor the parentDisabled flag
        stateVariableDefinitions.disabledDirectly = {
            public: true,
            shadowingInstructions: {
                createComponentOfType: "boolean",
            },
            forRenderer: true,
            hasEssential: true,
            doNotShadowEssential: true,
            defaultValue: false,
            returnDependencies: () => ({
                disabledPreliminary: {
                    dependencyType: "stateVariable",
                    variableName: "disabledPreliminary",
                    variablesOptional: true,
                },
                sourceCompositeDisabled: {
                    dependencyType: "sourceCompositeStateVariable",
                    variableName: "disabled",
                },
                adapterSourceDisabled: {
                    dependencyType: "adapterSourceStateVariable",
                    variableName: "disabled",
                },
            }),
            definition({ dependencyValues, usedDefault }) {
                if (!usedDefault.disabledPreliminary) {
                    return {
                        setValue: {
                            disabledDirectly:
                                dependencyValues.disabledPreliminary,
                        },
                    };
                }

                let disabledDirectly = false;
                let useEssential = true;

                if (
                    dependencyValues.sourceCompositeDisabled !== null &&
                    !usedDefault.sourceCompositeDisabled
                ) {
                    disabledDirectly =
                        disabledDirectly ||
                        dependencyValues.sourceCompositeDisabled;
                    useEssential = false;
                }
                if (
                    dependencyValues.adapterSourceDisabled !== null &&
                    !usedDefault.adapterSourceDisabled
                ) {
                    disabledDirectly =
                        disabledDirectly ||
                        dependencyValues.adapterSourceDisabled;
                    useEssential = false;
                }

                if (useEssential) {
                    return {
                        useEssentialOrDefaultValue: {
                            disabledDirectly: true,
                        },
                    };
                } else {
                    return { setValue: { disabledDirectly } };
                }
            },
        };

        return stateVariableDefinitions;
    }
}
