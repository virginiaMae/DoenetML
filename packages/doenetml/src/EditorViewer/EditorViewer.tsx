import {
    Box,
    Button,
    Flex,
    FormControl,
    FormLabel,
    Grid,
    GridItem,
    HStack,
    Spacer,
    Switch,
    Tooltip,
} from "@chakra-ui/react";
import React, {
    ReactElement,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { ResizablePanelPair } from "./ResizablePanelPair";
import { RxUpdate } from "react-icons/rx";
import { WarningTwoIcon } from "@chakra-ui/icons";
// @ts-ignore
import VariantSelect from "./VariantSelect";
import { CodeMirror } from "@doenet/codemirror";
import { DocViewer } from "../Viewer/DocViewer";
import ErrorWarningResponseTabs from "./ErrorWarningResponseTabs";
import {
    type WarningDescription,
    type ErrorDescription,
    nanInfinityReviver,
} from "@doenet/utils";
import { nanoid } from "nanoid";
import { prettyPrint } from "@doenet/parser";
import { formatResponse } from "../utils/responses";
import { ResizableCollapsiblePanelPair } from "./ResizableCollapsiblePanelPair";

export function EditorViewer({
    doenetML: initialDoenetML,
    activityId: specifiedActivityId,
    prefixForIds = "",
    linkSettings,
    darkMode = "light",
    showAnswerResponseMenu = false,
    answerResponseCounts = {},
    width = "100%",
    height = "500px",
    backgroundColor = "doenet.mainGray",
    showViewer = true,
    viewerLocation = "right",
    doenetmlChangeCallback,
    immediateDoenetmlChangeCallback,
    documentStructureCallback,
    id: specifiedId,
    readOnly = false,
    showFormatter = true,
    showErrorsWarnings = true,
    showResponses = true,
    border = "1px solid",
    initialErrors = [],
    initialWarnings = [],
}: {
    doenetML: string;
    activityId?: string;
    prefixForIds?: string;
    linkSettings?: { viewURL: string; editURL: string };
    darkMode?: "dark" | "light";
    showAnswerResponseMenu?: boolean;
    answerResponseCounts?: Record<string, number>;
    width?: string;
    height?: string;
    backgroundColor?: string;
    showViewer?: boolean;
    viewerLocation?: "left" | "right" | "top" | "bottom";
    doenetmlChangeCallback?: Function;
    immediateDoenetmlChangeCallback?: Function;
    documentStructureCallback?: Function;
    id?: string;
    readOnly?: boolean;
    showFormatter?: boolean;
    showErrorsWarnings?: boolean;
    showResponses?: boolean;
    border?: string;
    initialErrors?: ErrorDescription[];
    initialWarnings?: WarningDescription[];
}) {
    //Win, Mac or Linux
    let platform = "Linux";
    if (navigator.platform.indexOf("Win") != -1) {
        platform = "Win";
    } else if (navigator.platform.indexOf("Mac") != -1) {
        platform = "Mac";
    }

    if (readOnly) {
        showFormatter = false;
    }
    if (!showViewer) {
        showResponses = false;
    }

    const [id, setId] = useState(specifiedId ?? "editor-" + nanoid(5));
    const [activityId, setActivityId] = useState(specifiedActivityId ?? id);

    const [codeChanged, setCodeChanged] = useState(false);
    const codeChangedRef = useRef(false); //To keep value up to date in the code mirror function
    codeChangedRef.current = codeChanged;

    const [editorDoenetML, setEditorDoenetML] = useState(initialDoenetML);
    const [viewerDoenetML, setViewerDoenetML] = useState(initialDoenetML);
    const lastReportedDoenetML = useRef(initialDoenetML);
    const editorDoenetMLRef = useRef(editorDoenetML);
    editorDoenetMLRef.current = editorDoenetML;

    const [formatAsDoenetML, setFormatAsDoenetML] = useState(true);

    const updateValueTimer = useRef<number | null>(null);

    const scrollableContainer = useRef<HTMLDivElement>(null);

    const [variants, setVariants] = useState({
        index: 1,
        numVariants: 1,
        allPossibleVariants: ["a"],
    });

    const [infoPanelIsOpen, setInfoPanelIsOpen] = useState(false);

    const [errorsAndWarnings, setErrorsAndWarningsCallback] = useState<{
        errors: ErrorDescription[];
        warnings: WarningDescription[];
    }>({
        errors: [],
        warnings: [],
    });

    const warningsLevel = 1; //TODO: eventually give user ability adjust warning level filter
    const warningsObjs = [
        ...initialWarnings,
        ...errorsAndWarnings.warnings.filter((w) => w.level <= warningsLevel),
    ];
    const errorsObjs = [...initialErrors, ...errorsAndWarnings.errors];

    const [responses, setResponses] = useState<
        {
            answerId: string;
            response: ReactElement;
            creditAchieved: number;
            submittedAt: string;
        }[]
    >([]);

    useEffect(() => setResponses([]), [initialDoenetML]);

    useEffect(() => {
        function submittedResponseListener(event: any) {
            if (event.data.subject == "SPLICE.sendEvent") {
                const data = event.data;
                if (data.verb === "submitted") {
                    const object = JSON.parse(data.object);
                    const answerId = object.componentIdx;

                    if (answerId) {
                        const result = JSON.parse(
                            data.result,
                            nanInfinityReviver,
                        );
                        const answerCreditAchieved = result.creditAchieved;
                        const response: unknown[] = result.response;
                        const componentTypes: string[] = result.componentTypes;

                        const responseElement = formatResponse(
                            response,
                            componentTypes,
                        );

                        setResponses((was) => {
                            const arr = [...was];
                            arr.push({
                                answerId:
                                    answerId[0] === "/"
                                        ? answerId.substring(1)
                                        : answerId,
                                response: responseElement,
                                creditAchieved: answerCreditAchieved,
                                submittedAt: new Date().toLocaleTimeString(),
                            });
                            return arr;
                        });
                    }
                }
            }
        }

        addEventListener("message", submittedResponseListener);

        return () => {
            removeEventListener("message", submittedResponseListener);
        };
    }, [showViewer]);

    useEffect(() => {
        setEditorDoenetML(initialDoenetML);
    }, [initialDoenetML]);

    // call documentStructure callback followed by doenetmlChangeCallback
    // so that one can have access to the document structure before a
    // save in response to doenetmlChangeCallback
    const documentStructureThenChangeCallback = useCallback(
        (obj: unknown) => {
            documentStructureCallback?.(obj);
            doenetmlChangeCallback?.(editorDoenetMLRef.current);
        },
        [documentStructureCallback, doenetmlChangeCallback],
    );

    const onEditorChange = useCallback(
        (value: string) => {
            if (editorDoenetMLRef.current !== value) {
                setEditorDoenetML(value);

                if (!codeChangedRef.current) {
                    setCodeChanged(true);
                }

                immediateDoenetmlChangeCallback?.(value);

                // Debounce update value at 3 seconds
                clearTimeout(updateValueTimer.current ?? undefined);

                //TODO: when you try to leave the page before it saved you will lose work
                //so prompt the user on page leave
                updateValueTimer.current = window.setTimeout(function () {
                    if (
                        lastReportedDoenetML.current !==
                        editorDoenetMLRef.current
                    ) {
                        lastReportedDoenetML.current =
                            editorDoenetMLRef.current;
                        doenetmlChangeCallback?.(editorDoenetMLRef.current);
                    }
                    updateValueTimer.current = null;
                }, 3000); //3 seconds
            }
        },
        [immediateDoenetmlChangeCallback, doenetmlChangeCallback],
    );

    useEffect(() => {
        const handleEditorKeyDown = (event: KeyboardEvent) => {
            if (
                (platform == "Mac" && event.metaKey && event.code === "KeyS") ||
                (platform != "Mac" && event.ctrlKey && event.code === "KeyS")
            ) {
                event.preventDefault();
                event.stopPropagation();
                window.clearTimeout(updateValueTimer.current ?? undefined);
                setViewerDoenetML(editorDoenetMLRef.current);
                if (
                    lastReportedDoenetML.current !== editorDoenetMLRef.current
                ) {
                    lastReportedDoenetML.current = editorDoenetMLRef.current;
                    if (!showViewer) {
                        doenetmlChangeCallback?.(editorDoenetMLRef.current);
                    }
                }

                setCodeChanged(false);
                setResponses([]);

                updateValueTimer.current = null;
            }
        };

        let codeEditorContainer = document.getElementById(id);
        if (showViewer) {
            codeEditorContainer?.addEventListener(
                "keydown",
                handleEditorKeyDown,
            );
        }

        return () => {
            codeEditorContainer?.removeEventListener(
                "keydown",
                handleEditorKeyDown,
            );
        };
    }, [showViewer, id]);

    useEffect(() => {
        return () => {
            if (updateValueTimer.current !== null) {
                window.clearTimeout(updateValueTimer.current);
                if (
                    lastReportedDoenetML.current !== editorDoenetMLRef.current
                ) {
                    lastReportedDoenetML.current = editorDoenetMLRef.current;
                    doenetmlChangeCallback?.(editorDoenetMLRef.current);
                }
            }
        };
    }, []);

    let formatterAndVersion: React.ReactNode = null;

    formatterAndVersion = (
        <Flex
            ml="0px"
            h="32px"
            bg="doenet.mainGray"
            pl="10px"
            pt="1px"
            alignItems="center"
            justify="end"
        >
            {showFormatter ? (
                <>
                    <Box>
                        <FormControl display="flex" alignItems="center">
                            <Switch
                                id="asXml"
                                isChecked={formatAsDoenetML}
                                onChange={(e) => {
                                    setFormatAsDoenetML(e.target.checked);
                                }}
                                title="Format as DoenetML or XML. The DoenetML syntax is more compact but may not be compatible with other XML tools."
                            />
                            <FormLabel
                                htmlFor="asXml"
                                mb="0"
                                ml="2"
                                width="9.8em"
                                mr="10px"
                            >
                                Format as{" "}
                                {formatAsDoenetML ? "DoenetML" : "XML"}
                            </FormLabel>
                        </FormControl>
                    </Box>
                    <Box>
                        <Button
                            size="xs"
                            px="4"
                            mr="10px"
                            title="Format your source code"
                            onClick={async () => {
                                const printed = await prettyPrint(
                                    editorDoenetMLRef.current,
                                    {
                                        doenetSyntax: formatAsDoenetML,
                                        tabWidth: 2,
                                    },
                                );
                                onEditorChange(printed);
                            }}
                        >
                            Format
                        </Button>
                    </Box>
                </>
            ) : null}
            <Box alignSelf="center" fontSize="smaller" mr="10px">
                Version: {DOENETML_VERSION}
            </Box>
        </Flex>
    );

    const errorsWarningsResponses =
        showErrorsWarnings || showResponses ? (
            <ErrorWarningResponseTabs
                warnings={warningsObjs}
                errors={errorsObjs}
                submittedResponses={responses}
                isOpen={infoPanelIsOpen}
                setIsOpen={setInfoPanelIsOpen}
                showErrorsWarnings={showErrorsWarnings}
                showResponses={showResponses}
            />
        ) : null;

    const codeMirror = (
        <CodeMirror
            value={editorDoenetML}
            //TODO: read only isn't working <codeeditor disabled />
            readOnly={readOnly}
            onBlur={() => {
                window.clearTimeout(updateValueTimer.current ?? undefined);
                if (
                    lastReportedDoenetML.current !== editorDoenetMLRef.current
                ) {
                    lastReportedDoenetML.current = editorDoenetMLRef.current;
                    doenetmlChangeCallback?.(editorDoenetMLRef.current);
                }
                updateValueTimer.current = null;
            }}
            onChange={onEditorChange}
        />
    );

    const editorAndCollapsiblePanel = errorsWarningsResponses ? (
        <ResizableCollapsiblePanelPair
            mainPanel={codeMirror}
            subPanel={errorsWarningsResponses}
            isOpen={infoPanelIsOpen}
            setIsOpen={setInfoPanelIsOpen}
        />
    ) : (
        codeMirror
    );

    const editorPanel = (
        <Grid
            width="100%"
            height="100%"
            templateAreas={`"editor"
                            "formatter"`}
            gridTemplateRows={`1fr 32px`}
            gridTemplateColumns={`1fr`}
            boxSizing="border-box"
            background="doenet.canvas"
            overflowY="hidden"
            border="solid 1px"
            borderColor="doenet.mediumGray"
            id={id}
        >
            <GridItem
                area="editor"
                width="100%"
                height="100%"
                placeSelf="center"
                overflow="hidden"
            >
                {editorAndCollapsiblePanel}
            </GridItem>
            <GridItem
                area="formatter"
                width="100%"
                height="100%"
                placeSelf="center"
                overflow="hidden"
            >
                {formatterAndVersion}
            </GridItem>
        </Grid>
    );

    if (!showViewer) {
        return (
            <Box
                width={width}
                height={height}
                border={border}
                boxSizing="border-box"
            >
                {editorPanel}
            </Box>
        );
    }

    const controlHeight =
        !readOnly || variants.numVariants > 1 ? "32px" : "0px";

    const viewerPanel = (
        <Grid
            width="100%"
            height="100%"
            templateAreas={`"controls"
                            "viewer"`}
            gridTemplateRows={`${controlHeight} 1fr`}
            gridTemplateColumns={`1fr`}
            overflowY="hidden"
        >
            <GridItem
                area="controls"
                width="100%"
                height="100%"
                placeSelf="center"
                overflow="hidden"
                id={id + "-viewer-controls"}
            >
                <HStack w="100%" h="32px" bg={backgroundColor}>
                    {!readOnly && (
                        <Box>
                            <Tooltip
                                hasArrow
                                label={
                                    platform == "Mac"
                                        ? "Updates Viewer cmd+s"
                                        : "Updates Viewer ctrl+s"
                                }
                            >
                                <Button
                                    size="sm"
                                    variant="outline"
                                    data-test="Viewer Update Button"
                                    bg="doenet.canvas"
                                    leftIcon={<RxUpdate />}
                                    rightIcon={
                                        codeChanged ? (
                                            <WarningTwoIcon
                                                color="doenet.mainBlue"
                                                fontSize="18px"
                                            />
                                        ) : undefined
                                    }
                                    isDisabled={!codeChanged}
                                    onClick={() => {
                                        setViewerDoenetML(
                                            editorDoenetMLRef.current,
                                        );
                                        window.clearTimeout(
                                            updateValueTimer.current ??
                                                undefined,
                                        );
                                        if (
                                            lastReportedDoenetML.current !==
                                            editorDoenetMLRef.current
                                        ) {
                                            lastReportedDoenetML.current =
                                                editorDoenetMLRef.current;
                                            if (!showViewer) {
                                                doenetmlChangeCallback?.(
                                                    editorDoenetMLRef.current,
                                                );
                                            }
                                        }
                                        setCodeChanged(false);
                                        updateValueTimer.current = null;
                                        setResponses([]);
                                    }}
                                >
                                    Update
                                </Button>
                            </Tooltip>
                        </Box>
                    )}
                    {variants.numVariants > 1 && (
                        <Box bg={backgroundColor} h="32px" width="100%">
                            <VariantSelect
                                size="sm"
                                menuWidth="140px"
                                array={variants.allPossibleVariants}
                                syncIndex={variants.index}
                                onChange={(index: number) =>
                                    setVariants((prev) => {
                                        let next = { ...prev };
                                        next.index = index + 1;
                                        return next;
                                    })
                                }
                            />
                        </Box>
                    )}
                </HStack>
            </GridItem>
            <GridItem
                area="viewer"
                width="100%"
                height="100%"
                placeSelf="center"
                overflow="hidden"
            >
                <Box
                    height="100%"
                    width="100%"
                    background="var(--canvas)"
                    borderWidth="1px"
                    borderStyle="solid"
                    borderColor="doenet.mediumGray"
                    overflow="scroll"
                    id={id + "-viewer"}
                    ref={scrollableContainer}
                >
                    {/* @ts-ignore */}
                    <DocViewer
                        doenetML={viewerDoenetML}
                        flags={{
                            showCorrectness: true,
                            solutionDisplayMode: "button",
                            showFeedback: true,
                            showHints: true,
                            autoSubmit: false,
                            allowLoadState: false,
                            allowSaveState: false,
                            allowLocalState: false,
                            allowSaveEvents: showResponses,
                            readOnly: false,
                        }}
                        activityId={activityId}
                        prefixForIds={prefixForIds}
                        attemptNumber={1}
                        generatedVariantCallback={(x: any) => {
                            const allPossibleVariants = x.allPossibleVariants;
                            if (Array.isArray(allPossibleVariants)) {
                                const numVariants = allPossibleVariants.length;
                                if (
                                    typeof x.variantInfo === "object" &&
                                    typeof x.variantInfo.index === "number"
                                ) {
                                    const index = x.variantInfo.index;
                                    setVariants({
                                        index,
                                        numVariants,
                                        allPossibleVariants,
                                    });
                                }
                            }
                        }}
                        requestedVariantIndex={variants.index}
                        setErrorsAndWarningsCallback={
                            setErrorsAndWarningsCallback
                        }
                        documentStructureCallback={
                            documentStructureThenChangeCallback
                        }
                        linkSettings={linkSettings}
                        scrollableContainer={
                            scrollableContainer.current ?? undefined
                        }
                        darkMode={darkMode}
                        showAnswerResponseMenu={showAnswerResponseMenu}
                        answerResponseCounts={answerResponseCounts}
                    />
                </Box>
            </GridItem>
        </Grid>
    );

    const viewerFirst = viewerLocation === "left" || viewerLocation === "top";

    return (
        <ResizablePanelPair
            panelA={viewerFirst ? viewerPanel : editorPanel}
            panelB={viewerFirst ? editorPanel : viewerPanel}
            preferredDirection={
                viewerLocation === "bottom" || viewerLocation === "top"
                    ? "vertical"
                    : "horizontal"
            }
            width={width}
            height={height}
            border={border}
        />
    );
}
