#!/usr/bin/env node

/**
 * Script to convert WebWork problems (written in Perl) to DoenetML
 * TODO: tables
 */

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const tab = "  ";

export function convert(data) {
    // const sections = data.split(/#{4,}/);
    const documentMatch = data.match(/DOCUMENT\(\);(.*)ENDDOCUMENT\(\);/s);
    if (!documentMatch || documentMatch.length < 2) {
        console.warn(
            "Expected a 'DOCUMENT(); ... ENDDOCUMENT();' block, but none was found. Returning empty output.",
        );
        return "";
    }
    let document = documentMatch[1];

    // Remove comments
    document = document.replace(/\#.*/g, "");

    // std_problem_grader: credit only if every answer is right
    const allOrNothing =
        /install_problem_grader\([^)]*\bstd_problem_grader\b/.test(document);

    let content = "";
    let contentType = null;

    const findText = document.match(/BEGIN_TEXT(.*)END_TEXT/s);
    if (findText) {
        content = findText[1].trim();
        contentType = "text";
        document = document.replaceAll(/BEGIN_TEXT.*END_TEXT/gs, "");
    }

    const findPgml = document.match(/BEGIN_PGML(.*)END_PGML/s);
    if (findPgml) {
        if (contentType) {
            console.warn("Both TEXT and PGML found!!");
        }
        content = findPgml[1].trim();
        contentType = "pgml";
        document = document.replaceAll(/BEGIN_PGML.*END_PGML/gs, "");
    }

    if (!contentType) {
        console.warn("Neither TEXT nor PGML found");
        return "";
    }

    // Solution is always of type `text`
    let solutionSection = "";
    const findSolution = document.match(/SOLUTION.*;(.*)END_SOLUTION/s);
    if (findSolution) {
        solutionSection = findSolution[1].trim();
        document = document.replaceAll(/SOLUTION.*END_SOLUTION/gs, "");
    }

    // Arrays indexed by a random variable become a <select>
    let selects;
    [document, [content, solutionSection], selects] = convertIndexedArrays(
        document,
        [content, solutionSection],
    );

    // Perl subroutines (helpers, custom answer checkers) aren't converted
    let subroutineWarnings, checkers;
    [document, subroutineWarnings, checkers] = removeSubroutines(document);
    let usedCheckers = new Set();

    // Only the web version of `if ($displayMode eq 'TeX') {...} else {...}`
    document = dropTexDisplayMode(document);

    // Clean up the rest of the document a bit
    document = document.replace(/(\r\n)+/g, "\n");
    document = document.replace(/\n+/g, "\n");
    document = document.replace(/\r+/g, "\n");
    document = document.trim();

    // Split into statements
    let statements = splitStatements(document);

    statements = statements.filter(
        (v) =>
            v !== "" &&
            !v.includes("loadMacros") &&
            !v.includes("beginproblem") &&
            !v.includes("Context(") &&
            !/install_\w*grader\(/.test(v),
    );

    function splitStatementOn(
        statements,
        keyword,
        splitOn,
        keepKeyword = false,
    ) {
        for (let i = statements.length - 1; i >= 0; i--) {
            if (statements[i].indexOf(keyword) === 0) {
                let splitId = statements[i].indexOf(splitOn);
                let beforEndId = keepKeyword
                    ? splitId + keyword.length
                    : splitId;
                let before = statements[i].slice(0, beforEndId);
                let after = statements[i].slice(splitId + 1);

                before = before.replace("==", "=");
                statements[i] = before;
                statements.splice(i + 1, 0, after);
            }
        }
        statements = statements.map((s) => s.trim());

        return statements;
    }

    statements = splitStatementOn(statements, "}", "}", true);
    statements = splitStatementOn(statements, "if", "{");
    statements = splitStatementOn(statements, "elsif", "{");
    statements = splitStatementOn(statements, "else", "{");
    statements = statements.filter((s) => s !== "");

    // let out = "";
    let answers = [];
    let activeConditions = [];
    let prevCondition = "";

    // Keep track of graphs, we render them later
    let graphs = {};
    let graphContents = {};
    let graphBounds = {}; // from init_graph: { xmin, ymin, xmax, ymax }
    let graphPens = {}; // current point of $graph->moveTo/lineTo
    let graphFills = {}; // $graph->fillRegion([x, y, color]): [{ x, y }]
    let conditionalPlots = {}; // plot_functions in if blocks: [{ child, condition }]

    // Things that are printed in the TEXT section, so are rendered later
    let tables = {}; // $t = BeginTable()...: [{ graphs, labels }] per row
    let selectLists = {}; // new_select_list(): { pairs, numToShow }
    let popups = {}; // PopUp(): { choices, correct: [{ condition, value }] }
    let multiAnswers = {}; // MultiAnswer(): { parts, checker }
    let textSnippets = {}; // $v = ColumnTable(...): TEXT to print for $v
    let evaluatedFunctions = new Map(); // $f->eval(x=>...): f -> its variables

    function conditionTextOf(conditions) {
        return conditions.filter((c) => c !== "while").join(" and ");
    }

    let setup = new Map();
    function addSetup(name, open, child, close, conditions) {
        // `child` is always math: the contents of a <math>, <number>, etc.
        child = spaceLessThan(child);

        const conditionText = conditionTextOf(conditions);

        let data = setup.get(name);
        if (data) {
            // Keep the first open and close, add child option. Each option
            // also keeps its own open and close, in case its if block
            // becomes a <select> option.

            let childOptions = data.childOptions;
            childOptions.push({
                value: child,
                condition: conditionText,
                open,
                close,
            });

            setup.set(name, {
                open: data.open,
                childOptions: childOptions,
                close: data.close,
            });
        } else {
            // Use open and close and child
            let childOptions = [
                { value: child, condition: conditionText, open, close },
            ];
            setup.set(name, {
                open: open,
                childOptions: childOptions,
                close: close,
            });
        }
    }

    let out = subroutineWarnings;
    for (let select of selects) {
        out += select + "\n";
    }

    let graphicalStyleCount = 0; //styling for graphical objects
    const colorStyles = new Map(); // FEQ color -> styleNumber
    for (let statement of statements) {
        let find;

        // Open conditional if
        if ((find = statement.match(/if\s*\((.*)\)/))) {
            // Perl -> DoenetML: `$a == 3 && $b == 6` -> `$a = 3 and $b = 6`
            let condition = find[1]
                .trim()
                .replaceAll("==", "=")
                .replaceAll("&&", " and ")
                .replaceAll("||", " or ")
                .replace(/\s+eq\s+/g, " = ")
                .replace(/\s+/g, " ");
            activeConditions.push(condition);

            // Open conditional else
        } else if (statement === "else") {
            activeConditions.push("else");

            // Open conditional: while
        } else if ((find = statement.match(/while\s*\((.*)\)/))) {
            out += warnAndComment("Not implemented: while statements");
            // let condition = find[1].trim();
            activeConditions.push("while");

            // Close conditional
        } else if (statement === "}") {
            prevCondition = activeConditions.pop();

            // Method call on a graph or select list: $graph1->fillRegion(...)
        } else if (
            (find = statement.match(/^\$(\w+)->(\w+)\(([\s\S]*)\)$/)) &&
            (graphs[find[1]] || selectLists[find[1]])
        ) {
            const [, objectName, method, argsString] = find;
            const args = splitTopLevel(argsString);
            const list = selectLists[objectName];

            if (list && method === "qa") {
                // Alternating questions and answers
                const strings = args.map((arg) =>
                    arg.replace(/^(["'])([\s\S]*)\1$/, "$2"),
                );
                for (let i = 0; i + 1 < strings.length; i += 2) {
                    list.pairs.push([strings[i], strings[i + 1]]);
                }
            } else if (list && method === "choose") {
                list.numToShow = Number(args[0]);
            } else if (method === "moveTo") {
                graphPens[objectName] = [args[0], args[1]];
            } else if (method === "lineTo" && graphPens[objectName]) {
                const [x1, y1] = graphPens[objectName];
                (graphContents[objectName] ??= []).push(
                    `<lineSegment endpoints="(${x1},${y1}) (${args[0]},${args[1]})"/>`,
                );
                graphPens[objectName] = [args[0], args[1]];
            } else if (method === "fillRegion") {
                const [x, y] = splitTopLevel(args[0].replace(/^\[|\]$/g, ""));
                (graphFills[objectName] ??= []).push({ x, y });
            } else {
                out += warnAndComment(`Unrecognized pattern: ${statement}`);
            }

            // Display option of a select list: $sl->{separation} = 10
        } else if (
            (find = statement.match(/^\$(\w+)->\{/)) &&
            selectLists[find[1]]
        ) {
            // Nothing to convert
            // Display options for a table: @ops = (separation=>30, indent=>0)
        } else if (/^@\w+\s*=\s*\(.*=>.*\)$/.test(statement)) {
            // Nothing to convert
            // == Variable declaration ===
            // Of the form $a = ...;
        } else if ((find = statement.match(/\$(\w+)\s*=(.*)/))) {
            const varName = find[1].trim();
            const varValue = find[2].trim();
            const findFunc = varValue.match(/(\w+)\((.*)\)(->\w+)?/);

            // Special case: init_graph()
            // Of the form $a = init_graph(...)...;
            if (findFunc && findFunc[1] === "init_graph") {
                graphs[varName] = graphOpenTag(findFunc[2]);
                const [xmin, ymin, xmax, ymax] = splitArgs(findFunc[2])
                    .slice(0, 4)
                    .map(Number);
                graphBounds[varName] = { xmin, ymin, xmax, ymax };

                // Special case: matching list, printed in the TEXT section
                // Of the form $sl = new_select_list();
            } else if (findFunc && findFunc[1] === "new_select_list") {
                selectLists[varName] = { pairs: [], numToShow: null };

                // Special case: drop-down menu, printed in the TEXT section
                // Of the form $p = PopUp(['?', 'Yes', 'No'], 'Yes');
            } else if (findFunc && findFunc[1] === "PopUp") {
                const unquote = (s) => s.replace(/^(["'])([\s\S]*)\1$/, "$2");
                const [choicesArg, correctArg] = splitTopLevel(findFunc[2]);
                const choices = splitTopLevel(
                    choicesArg.replace(/^\[|\]$/g, ""),
                )
                    .map(unquote)
                    // '?' or '' is WeBWorK's "nothing selected yet" entry
                    .filter((choice) => !["?", "", "-"].includes(choice));
                popups[varName] ??= { choices, correct: [] };
                popups[varName].correct.push({
                    condition: conditionTextOf(activeConditions),
                    hasElse: activeConditions.includes("else"),
                    value: unquote(correctArg),
                });

                // Special case: table of graphs, printed in the TEXT section
                // Of the form $t = BeginTable(). Row([...]). ... EndTable();
            } else if (varValue.startsWith("BeginTable")) {
                tables[varName] = parseTable(varValue);

                // Special case: several answer blanks checked together
                // Of the form $m = MultiAnswer($a, $b)->with(checker => sub {...});
            } else if (varValue.startsWith("MultiAnswer(")) {
                const closeId = findClosing(varValue, "MultiAnswer".length);
                const parts = splitTopLevel(
                    varValue.slice("MultiAnswer(".length, closeId),
                );
                const checkerId = varValue.match(/⟦checker(\d+)⟧/)?.[1];
                if (checkerId !== undefined) {
                    usedCheckers.add(Number(checkerId));
                }
                const checker =
                    checkerId === undefined
                        ? null
                        : checkers[Number(checkerId)];
                multiAnswers[varName] = {
                    parts,
                    checker,
                    // Blanks that can be answered in either order become
                    // inputs checked by one <answer>, filled in as found
                    anyOrder: isAnyOrderChecker(checker, parts)
                        ? {
                              parts,
                              inputs: [],
                              lhs: [],
                              // All-or-nothing grading ignores a checker's
                              // partial credit
                              partialCredit:
                                  !allOrNothing &&
                                  /return\s*\[\s*(1\s*,\s*0|0\s*,\s*1)\s*\]/.test(
                                      checker,
                                  ),
                          }
                        : null,
                };

                // Special case: a layout of text and answer blanks
                // Of the form $v = ColumnTable("\( x = \)", $m->ans_rule(20), ...);
            } else if (varValue.startsWith("ColumnTable(")) {
                const closeId = findClosing(varValue, "ColumnTable".length);
                const columns = splitTopLevel(
                    varValue.slice("ColumnTable(".length, closeId),
                ).filter((arg) => !arg.includes("=>"));
                textSnippets[varName] = columns.map(perlToText).join(" ");

                // Function statement
                // Of the form $a = b(c)...;
            } else if (findFunc && findFunc.index === 0) {
                let [open, child, close, gStyle] = functionStatement(
                    varName,
                    findFunc[1],
                    findFunc[2],
                    graphicalStyleCount,
                    colorStyles,
                );
                // Formula(...)->reduce: simplify it
                if (findFunc[3] === "->reduce") {
                    open = open.replace(
                        / simplify="[^"]*"/,
                        ` simplify="full"`,
                    );
                }
                addSetup(varName, open, child, close, activeConditions);
                graphicalStyleCount = gStyle;

                // Special case: partial answers
                // Not needed: each answer blank becomes its own <answer>
            } else if (varName === "showPartialCorrectAnswers") {
                // Evaluating a formula: $y = $f->eval(x=>-4)
                // f becomes a <function> (after all statements) and y = $$f(-4)
            } else if (
                (find = varValue.match(/^\$(\w+)->eval\(([\s\S]*)\)$/))
            ) {
                const [, functionName, argsString] = find;
                const pairs = splitTopLevel(argsString).map((arg) =>
                    arg.split(/\s*=>\s*/),
                );
                evaluatedFunctions.set(
                    functionName,
                    pairs.map(([variable]) => variable.replace(/["']/g, "")),
                );
                const inputs = pairs.map(([, value]) => value).join(", ");
                addSetup(
                    varName,
                    `<math name="${varName}">`,
                    `$$${functionName}(${inputs})`,
                    `</math>`,
                    activeConditions,
                );

                // Variable assignment, no function
            } else {
                // stick it in a math tag
                let open = `<math name="${varName}">`;
                let child = `${varValue}`;
                child = child.replaceAll(`"`, ``);
                let close = `</math>`;
                // A TeX string, e.g. "\frac{$a}{x}": convert it to math
                if (/\\[a-zA-Z]/.test(child)) {
                    const math = texToMath(child);
                    if (math === null) {
                        open = `<math name="${varName}" format="latex">`;
                    } else {
                        child = math;
                    }
                }
                addSetup(varName, open, child, close, activeConditions);
            }

            // Special case: plot_functions
            // plot_functions(...);
        } else if ((find = statement.match(/plot_functions\((.*)\)/))) {
            const plotArgs = splitArgs(find[1]);
            let plotGraph = plotArgs.shift();
            plotGraph = plotGraph.slice(1); //remove $

            // Plots inside if blocks are sorted out after all statements
            const condition = conditionTextOf(activeConditions);
            for (let child of plotArgs) {
                if (condition) {
                    (conditionalPlots[plotGraph] ??= []).push({
                        child,
                        condition,
                    });
                } else {
                    (graphContents[plotGraph] ??= []).push(child);
                }
            }

            // Answers
            // Of the form ANS(...);
        } else if ((find = statement.match(/ANS\(\s*(.*)\s*\)/))) {
            let arg = find[1];

            // Pop-up menus and select lists get their <answer>s where
            // they're printed in the TEXT section
            const findObject =
                arg.match(/^\$(\w+)->cmp\b/) ??
                arg.match(/\$(\w+)->ra_correct_ans\b/);
            if (
                findObject &&
                (popups[findObject[1]] ||
                    selectLists[findObject[1]] ||
                    multiAnswers[findObject[1]])
            ) {
                continue;
            }

            let parts = arg.split("->");
            // Ignore extra parts for now
            // if(parts.length > 1) {
            //   if(find = parts[1].match(/cmp\((.*)\)/)) {
            //     let cmpArgs = splitArgs(find[1]);
            //     console.log(cmpArgs);
            //   }
            // }

            let ans = parts[0];

            if ((find = ans.match(/(\w+)\s*\(\s*(.*)\s*\)/))) {
                if (find[1] == "fun_cmp") {
                    ans = splitArgs(find[2])[0];
                } else {
                    const [open, child, close, gStyle] = functionStatement(
                        undefined,
                        find[1],
                        find[2],
                        graphicalStyleCount,
                        colorStyles,
                    );
                    ans = open + child + close;
                }
            }

            answers.push(ans);

            // ERROR: unrecognized pattern
        } else {
            out += warnAndComment(`Unrecognized pattern: ${statement}`);
        }
    }

    // Formulas that get evaluated are functions: <function name="f">
    for (let [functionName, variables] of evaluatedFunctions) {
        const data = setup.get(functionName);
        if (!data) {
            continue;
        }
        const variablesAttribute =
            variables.join(" ") === "x"
                ? ""
                : ` variables="${variables.join(" ")}"`;
        const toFunction = (open) =>
            open
                .replace(/^<math\b/, "<function")
                .replace(/>$/, `${variablesAttribute}>`);
        data.open = toFunction(data.open);
        data.close = "</function>";
        for (let option of data.childOptions) {
            option.open = toFunction(option.open);
            option.close = "</function>";
        }
    }

    // Custom answer checkers that weren't part of a MultiAnswer
    checkers.forEach((checker, i) => {
        if (!usedCheckers.has(i)) {
            out += warnAndComment(
                "Not converted: custom answer checker (anonymous Perl subroutine); check the answer by hand",
            );
        }
    });

    // References to rename at the end: $old -> $new
    let renames = new Map();

    // Answers are named ans1, ans2, ... so Perl variables with those names
    // would clash with them: $ans1 -> sol1
    if ([...setup.keys()].some((name) => /^ans\d+$/.test(name))) {
        let renamedSetup = new Map();
        for (let [name, data] of setup) {
            if (/^ans\d+$/.test(name)) {
                let newName = name.replace(/^ans/, "sol");
                if (setup.has(newName)) {
                    newName = `${name}Value`;
                }
                const rename = (open) =>
                    open.replace(`name="${name}"`, `name="${newName}"`);
                data.open = rename(data.open);
                for (let option of data.childOptions) {
                    option.open = rename(option.open);
                }
                renames.set(name, newName);
                name = newName;
            }
            renamedSetup.set(name, data);
        }
        setup = renamedSetup;
    }

    // If blocks that switch on a random value become a <select>:
    //
    //     $a = random(1,2,1);
    //     if ($a==1) { $p = FEQ(...); plot_functions($graph1, $p); }
    //     if ($a==2) { $p = FEQ(...); plot_functions($graph1, $p); }
    //
    // becomes a <select> with an <option> for each value of $a, holding
    // <number name="a">, that branch's definitions, and a <group> of what it
    // plots on each graph. References from outside go through the select:
    // `$p` -> `$s1.p`. Definitions with any other kind of condition are left
    // as they were.
    let switchSelects = [];
    // Refer to `name` through the select, e.g. p -> s1.p, including where
    // it was already renamed to (e.g. ans1 -> sol1 -> s1.sol1)
    function renameThroughSelect(name, selectName) {
        const qualified = `${selectName}.${name}`;
        for (let [oldName, newName] of renames) {
            if (newName === name) {
                renames.set(oldName, qualified);
            }
        }
        renames.set(name, qualified);
    }
    const switchCondition = (condition) =>
        condition.match(/^\$(\w+)\s*=\s*(-?\d+)$/);

    // Definitions and plots where every condition is `$v = k`, by v
    let switches = new Map();
    for (let [name, data] of setup) {
        const matches = data.childOptions.map((option) =>
            switchCondition(option.condition),
        );
        const variable = matches[0]?.[1];
        if (variable && matches.every((m) => m && m[1] === variable)) {
            if (!switches.has(variable)) {
                switches.set(variable, { definitions: [], plots: [] });
            }
            switches.get(variable).definitions.push(name);
        }
    }
    for (let [graphName, plots] of Object.entries(conditionalPlots)) {
        for (let plot of plots) {
            const variable = switchCondition(plot.condition)?.[1];
            if (switches.has(variable)) {
                switches.get(variable).plots.push({ graphName, ...plot });
            }
        }
    }

    for (let [variable, { definitions, plots }] of switches) {
        // The variable must be a plain random(from, to, step)
        const variableData = setup.get(variable);
        const findRandom = variableData?.open.match(
            /^<selectFromSequence name="\w+" from="(-?\d+)" to="(-?\d+)"( step="(\d+)")?( exclude="0")?\/>$/,
        );
        if (
            !findRandom ||
            variableData.childOptions.length !== 1 ||
            variableData.childOptions[0].condition !== ""
        ) {
            continue;
        }
        const [, from, to, , step = "1", exclude] = findRandom;
        let values = [];
        for (let k = Number(from); k <= Number(to); k += Number(step)) {
            if (!(exclude && k === 0)) {
                values.push(k);
            }
        }
        if (values.length === 0 || values.length > 20) {
            continue;
        }

        const selectName = `s${selects.length + switchSelects.length + 1}`;
        let select = `<select name="${selectName}">\n`;
        for (let k of values) {
            const isK = (condition) =>
                Number(switchCondition(condition)[2]) === k;
            select += `${tab}<option>\n`;
            select += `${tab}${tab}<number name="${variable}">${k}</number>\n`;
            for (let name of definitions) {
                for (let option of setup.get(name).childOptions) {
                    if (isK(option.condition)) {
                        // The final renaming skips the select, so apply the
                        // ans1 -> sol1 renames here; names in the same
                        // option don't need to go through the select
                        const value = option.value.replace(
                            /(\$\$?)(ans\d+)\b(?!\.\w)/g,
                            (match, dollars, ansName) =>
                                renames.has(ansName)
                                    ? dollars + renames.get(ansName)
                                    : match,
                        );
                        select += `${tab}${tab}${option.open}${value}${option.close}\n`;
                    }
                }
            }
            // What this branch plots on each graph
            let branchPlots = {};
            for (let { graphName, child, condition } of plots) {
                if (isK(condition)) {
                    (branchPlots[graphName] ??= []).push(child);
                }
            }
            for (let [graphName, children] of Object.entries(branchPlots)) {
                select += `${tab}${tab}<group name="${graphName}Plot">${children.join(" ")}</group>\n`;
            }
            select += `${tab}</option>\n`;
        }
        select += `</select>`;
        switchSelects.push(select);

        // Take everything that's now in the select out of setup
        setup.delete(variable);
        renameThroughSelect(variable, selectName);
        for (let name of definitions) {
            setup.delete(name);
            renameThroughSelect(name, selectName);
        }
        for (let graphName of new Set(plots.map((p) => p.graphName))) {
            (graphContents[graphName] ??= []).push(
                `$${selectName}.${graphName}Plot`,
            );
            conditionalPlots[graphName] = conditionalPlots[graphName].filter(
                (plot) => switchCondition(plot.condition)?.[1] !== variable,
            );
        }
    }

    // Any other plots in if blocks: plot everything (each only once)
    for (let [graphName, plots] of Object.entries(conditionalPlots)) {
        for (let { child } of plots) {
            graphContents[graphName] ??= [];
            if (!graphContents[graphName].includes(child)) {
                graphContents[graphName].push(child);
            }
        }
    }

    // WeBWorK problems often plot the same curve twice on a graph
    // (plot_functions($graph1, $p1a, $p1b) with $p1b identical to $p1a).
    // Keep the first, and drop the copy from setup if nothing else uses it.
    const droppedCurves = new Set();
    for (let [graphName, contents] of Object.entries(graphContents)) {
        const seen = new Set();
        graphContents[graphName] = contents.filter((child) => {
            const key = curveKey(setup.get(child.match(/^\$(\w+)$/)?.[1]));
            if (key === null) {
                return true;
            }
            if (seen.has(key)) {
                droppedCurves.add(child.slice(1));
                return false;
            }
            seen.add(key);
            return true;
        });
    }
    for (let name of droppedCurves) {
        const reference = new RegExp(`\\$${name}\\b`);
        const usedInGraph = Object.values(graphContents).some((contents) =>
            contents.includes(`$${name}`),
        );
        // Any use other than its definition and plot_functions
        const usedElsewhere =
            reference.test(content) ||
            reference.test(solutionSection) ||
            statements.some(
                (statement) =>
                    reference.test(statement) &&
                    !/plot_functions\(/.test(statement) &&
                    !new RegExp(`^\\$${name}\\s*=`).test(statement),
            );
        if (!usedInGraph && !usedElsewhere) {
            setup.delete(name);
        }
    }

    // Image sizes, e.g. `$w = 400; # graph size` used only in
    // image(..., width=>$w, tex_size=>$tw): DoenetML graphs don't need them
    for (let name of setup.keys()) {
        const sizeUse = new RegExp(
            `\\b(width|height|tex_size)\\s*=>\\s*\\$${name}\\b`,
        );
        const reference = new RegExp(`\\$${name}\\b`);
        const otherUse = (text) =>
            reference.test(text.replace(new RegExp(sizeUse.source, "g"), ""));
        const usedForSize = [content, solutionSection, ...statements].some(
            (text) => sizeUse.test(text),
        );
        if (
            usedForSize &&
            !otherUse(content) &&
            !otherUse(solutionSection) &&
            !statements.some(
                (statement) =>
                    otherUse(statement) &&
                    !new RegExp(`^\\$${name}\\s*=`).test(statement),
            )
        ) {
            setup.delete(name);
        }
    }

    // Shading: $graph->fillRegion([x, y, color]) fills the region containing
    // (x, y). We can convert this when the graph has a single function:
    // shade between the function and the top or bottom edge of the graph,
    // whichever side (x, y) is on. Since the function can depend on random
    // values, DoenetML picks the side with sign().
    //
    // If the function doesn't span the graph's width, each end inside the
    // graph must be closed off by a vertical line segment (e.g. x <= 2 and
    // y >= 4), otherwise WeBWorK's fill would spill around it.
    let graphRegions = {};
    for (let [graphName, fills] of Object.entries(graphFills)) {
        const { xmin, ymin, xmax, ymax } = graphBounds[graphName];
        const contents = graphContents[graphName] ?? [];
        const functionRefs = contents.filter((c) => c.startsWith("$"));
        const functionName = functionRefs[0]?.slice(1);
        const data = setup.get(functionName);
        const domain = data?.open.match(/domain="\[([^,]*),([^\]]*)\]"/);
        const from = Math.max(Number(domain?.[1]), xmin);
        const to = Math.min(Number(domain?.[2]), xmax);

        // x values of vertical line segments
        const verticalXs = contents
            .map((c) =>
                c.match(
                    /^<lineSegment endpoints="\(([^,]*),[^)]*\) \(([^,]*),[^)]*\)"\/>$/,
                ),
            )
            .filter((m) => m && Number(m[1]) === Number(m[2]))
            .map((m) => Number(m[1]));
        const isClosed = (x, edge) => x === edge || verticalXs.includes(x);

        const fillX = Number(fills[0].x);
        const canConvert =
            fills.length === 1 &&
            functionRefs.length === 1 &&
            contents.length === functionRefs.length + verticalXs.length &&
            data &&
            data.childOptions.length === 1 &&
            data.childOptions[0].condition === "" &&
            [xmin, ymin, xmax, ymax, from, to, fillX].every(Number.isFinite) &&
            from <= fillX &&
            fillX <= to &&
            isClosed(from, xmin) &&
            isClosed(to, xmax);
        if (!canConvert) {
            graphRegions[graphName] = warnAndComment(
                `Not converted: shading in ${graphName}; add a region by hand`,
            );
            continue;
        }

        const { x, y } = fills[0];
        const middle = (ymin + ymax) / 2;
        const halfHeight = (ymax - ymin) / 2;
        const boundaryName = `${graphName}Edge`;
        addSetup(
            boundaryName,
            `<function name="${boundaryName}">`,
            `${middle} + ${halfHeight} sign(${y} - $$${functionName}(${x}))`,
            `</function>`,
            [],
        );
        graphRegions[graphName] =
            `<regionBetweenCurves boundaryValues="${from} ${to}">$${functionName} $${boundaryName}</regionBetweenCurves>`;
    }

    // Labels for graphs in a table, e.g. A, B, C, D
    let graphLabels = {};
    for (let rows of Object.values(tables)) {
        for (let { graphs: rowGraphs, labels } of rows) {
            rowGraphs.forEach((graphName, i) => {
                if (graphName && labels[i]) {
                    graphLabels[graphName] = labels[i];
                }
            });
        }
    }

    // Everything the TEXT section needs to render graphs, menus and lists
    const context = {
        graphs,
        graphContents,
        graphRegions,
        graphLabels,
        tables,
        selectLists,
        popups,
        multiAnswers,
        textSnippets,
        // Names taken in <setup>, and definitions the TEXT section adds to it
        setupNames: new Set(setup.keys()),
        extraSetup: [],
    };

    // Placeholders for the <select>s from if blocks, filled in at the end so
    // that renaming references doesn't touch what's inside them
    switchSelects.forEach((select, i) => {
        out += `⟦switch${i}⟧\n`;
    });

    for (let [name, data] of setup) {
        let options = data.childOptions;
        if (
            data.open.startsWith("<function") &&
            !(options.length === 1 && options[0].condition === "")
        ) {
            out += warnAndComment(
                `${name} is defined differently in if blocks, but its domain and style come from the first definition; check its graph by hand`,
            );
        }

        out += data.open;

        if (options.length === 1 && options[0].condition === "") {
            out += options[0].value;
        } else {
            out += `<conditionalContent>\n`;
            for (let option of options) {
                if (option.condition === "else") {
                    //TODO: bug with else nested inside if
                    out += `${tab}<else>${option.value}</else>\n`;
                } else {
                    out += `${tab}<case condition="${escapeAttribute(option.condition)}">${option.value}</case>\n`;
                }
            }
            out += `</conditionalContent>`;
        }

        out += data.close + "\n";
    }

    out = tab + out;
    out = out.replaceAll("\n", `\n${tab}`);
    out = out.slice(0, -tab.length);
    out = `<setup>\n` + out + `</setup>\n\n`;

    // out = out.replaceAll(/<setup>(.*)\n(.*)<\/setup>/gs, `<setup>$1\n${tab}$2</setup>`);

    // ==== PARSE TEXT/PGML =====
    // Each answer blank becomes an inline <answer>; record what we emitted
    // so the <givenAnswer> can list them.
    let answerRecords = [];
    let textOut;
    if (contentType === "text") {
        // TEXT
        textOut = textSection(content, answers, answerRecords, context);
        const numBlanks = answerRecords.filter((r) => r.blank).length;
        if (answerRecords.length === 0) {
            out += warnAndComment("No answers found in problem");
        } else if (numBlanks !== answers.length) {
            out += warnAndComment(
                `Found ${numBlanks} answer blanks but ${answers.length} ANS() calls`,
            );
        }
    } else {
        // PGML
        textOut = pgmlSection(content, answerRecords);
    }
    if (context.extraSetup.length > 0) {
        const lines = context.extraSetup
            .join("\n")
            .replaceAll("\n", `\n${tab}`);
        out = out.replace("</setup>\n\n", `${tab}${lines}\n</setup>\n\n`);
    }
    if (allOrNothing) {
        textOut =
            combineAnswers(textOut) ??
            warnAndComment(
                "WeBWorK grades this problem all-or-nothing (std_problem_grader); combine its answers into one <answer> by hand",
            ) + textOut;
    }
    out += textOut;

    // THE ANSWER AND SOLUTION
    // Answers from a <part> are listed in a <part> too, so the numbers match
    let givenAnswerOut = "";
    for (let { lhs, answer, givenAnswer, part } of answerRecords) {
        let item = "";
        if (givenAnswer !== undefined) {
            item = givenAnswer;
        } else if (answer === undefined) {
            continue;
        } else if (answer.startsWith("<")) {
            const lhsOut = lhs ? `<m>${lhs} =</m> ` : "";
            item = part ? `${lhsOut}${answer}` : `<p>${lhsOut}${answer}</p>`;
        } else {
            const lhsOut = lhs ? `${lhs} = ` : "";
            const math = `<m>${lhsOut}${answer}</m>`;
            item = part ? math : `<p>${math}</p>`;
        }
        if (item) {
            item = item.replaceAll("\n", `\n${tab}`);
            givenAnswerOut += part
                ? `${tab}<part>${item}</part>\n`
                : `${tab}${item}\n`;
        }
    }
    if (givenAnswerOut) {
        out += `\n<givenAnswer>\n${givenAnswerOut}</givenAnswer>\n`;
    }

    if (solutionSection) {
        const solutionOut = textSection(solutionSection, [], [], context);
        out += `\n<solution>\n${solutionOut}</solution>\n`;
    }

    // References to what moved into a <select> go through the select
    if (renames.size > 0) {
        const renameRegex = new RegExp(
            String.raw`(\$\$?)(${[...renames.keys()].join("|")})\b(?!\.\w)`,
            "g",
        );
        out = out.replace(
            renameRegex,
            (match, dollars, name) => dollars + renames.get(name),
        );
    }
    switchSelects.forEach((select, i) => {
        out = out.replace(`⟦switch${i}⟧`, select.replaceAll("\n", `\n${tab}`));
    });

    // A commented-out block that shows the correct answers, for checking
    // variants while authoring
    const answerValues = [
        ...new Set(
            answerRecords
                .map(({ answer }) => answer?.match(/^\$([\w.]+)$/)?.[1])
                .filter((name) => name),
        ),
    ].map((name) => renames.get(name) ?? name);
    if (answerValues.length > 0) {
        const lines = answerValues
            .map((name) => `<p>${name} = $${name}</p>`)
            .join("\n");
        out = out.replace(
            "</setup>\n\n",
            `</setup>\n\n<!-- testing -->\n<!-- ${lines} -->\n<!-- /testing -->\n\n`,
        );
    }

    out = headerComment(data) + "<problem><title />\n" + out;
    out += "</problem>\n";

    return out;
}

/**
 * WeBWorK problems often pick a variant with `$n = random(0,k,1)` and then
 * index parallel arrays with it:
 *
 *     @var = ("h", "\(r^2\)");
 *     @answer = (Formula("(3V)/(pi*r^2)"), Formula("(3V)/(pi*h)"));
 *     ... $var[$n] ... $answer[$n] ...
 *
 * Convert that pattern to a <select> whose options each define one entry
 * from every array, and rewrite `$var[$n]` as `$s1.var`.
 *
 * Arrays that don't fit the pattern are left alone (and later reported as
 * unrecognized).
 *
 * @param {string} document - the Perl code, with TEXT/PGML/SOLUTION removed
 * @param {string[]} texts - TEXT/PGML/SOLUTION sections, also rewritten
 * @returns {[string, string[], string[]]} [document, texts, selects]
 */
function convertIndexedArrays(document, texts) {
    // Array declarations: @name = (...);
    let arrays = new Map();
    const declRegex = /@(\w+)\s*=\s*\(/g;
    let find;
    while ((find = declRegex.exec(document))) {
        const openId = find.index + find[0].length - 1;
        const closeId = findClosing(document, openId);
        if (closeId === -1) {
            continue;
        }
        const semicolon = document.slice(closeId + 1).match(/^\s*;/);
        const endId = closeId + 1 + (semicolon ? semicolon[0].length : 0);
        arrays.set(find[1], {
            elements: splitTopLevel(document.slice(openId + 1, closeId)),
            statement: document.slice(find.index, endId),
        });
    }

    // Uses of the form $array[$index], grouped by index variable
    const allCode = [document, ...texts].join("\n");
    let indexUses = new Map();
    for (let use of allCode.matchAll(/\$(\w+)\[\s*\$(\w+)\s*\]/g)) {
        const [, arrayName, indexVar] = use;
        if (!indexUses.has(indexVar)) {
            indexUses.set(indexVar, new Set());
        }
        indexUses.get(indexVar).add(arrayName);
    }

    let selects = [];
    for (let [indexVar, arrayNameSet] of indexUses) {
        // In the order they were declared
        const arrayNames = [...arrays.keys()].filter((name) =>
            arrayNameSet.has(name),
        );
        if (arrayNames.length !== arrayNameSet.size) {
            continue;
        }

        // The index must be random(0, k) or random(0, k, 1)...
        const randomMatch = document.match(
            new RegExp(String.raw`\$${indexVar}\s*=\s*random\(([^;]*)\)\s*;`),
        );
        if (!randomMatch) {
            continue;
        }
        const [from, to, step = "1"] = splitTopLevel(randomMatch[1]);
        const numOptions = Number(to) + 1;
        if (from !== "0" || step !== "1" || !Number.isInteger(numOptions)) {
            continue;
        }

        // ...every array it indexes must have k+1 entries...
        if (
            !arrayNames.every(
                (name) => arrays.get(name)?.elements.length === numOptions,
            )
        ) {
            continue;
        }

        // ...and neither the index nor the arrays can be used any other way
        const refRegex = new RegExp(
            String.raw`\$(${arrayNames.join("|")})\[\s*\$${indexVar}\s*\]`,
            "g",
        );
        const otherCode = allCode
            .replace(randomMatch[0], "")
            .replaceAll(refRegex, "");
        const otherUse = new RegExp(
            String.raw`\$${indexVar}\b|[$@](${arrayNames.join("|")})\b`,
        );
        if (
            otherUse.test(
                arrayNames.reduce(
                    (code, name) =>
                        code.replace(arrays.get(name).statement, ""),
                    otherCode,
                ),
            )
        ) {
            continue;
        }

        const selectName = `s${selects.length + 1}`;
        let select = `<select name="${selectName}">\n`;
        for (let i = 0; i < numOptions; i++) {
            select += `${tab}<option>\n`;
            for (let name of arrayNames) {
                const element = arrays.get(name).elements[i];
                select += `${tab}${tab}${arrayElement(name, element)}\n`;
            }
            select += `${tab}</option>\n`;
        }
        select += `</select>`;
        selects.push(select);

        document = document.replace(randomMatch[0], "");
        for (let name of arrayNames) {
            document = document.replace(arrays.get(name).statement, "");
        }

        // Wrap the reference in $(...) if a letter, digit, etc. follows it
        const rewrite = (code) =>
            code.replaceAll(refRegex, (match, name, offset, string) => {
                const next = string.slice(offset + match.length);
                return /^(\w|\.\w|\[)/.test(next)
                    ? `$(${selectName}.${name})`
                    : `$${selectName}.${name}`;
            });
        document = rewrite(document);
        texts = texts.map(rewrite);
    }

    return [document, texts, selects];
}

/**
 * Replace Perl subroutines with a single warning each, rather than letting
 * every statement in their body show up as an unrecognized pattern.
 *
 * - Named subroutines (`sub bold {...}`) are removed.
 * - Anonymous ones (`checker => sub {...}`, usually custom answer checkers)
 *   are replaced by `sub {⟦checkerN⟧}` so the surrounding statement still
 *   parses. Their bodies are returned, so a MultiAnswer can translate its
 *   checker; any that aren't used get a warning later.
 *
 * @returns {[string, string, string[]]} [document, warning comments, checker bodies]
 */
function removeSubroutines(document) {
    let warnings = "";
    let checkers = [];
    const subRegex = /\bsub\b\s*(\w*)\s*\{/g;
    let find;
    while ((find = subRegex.exec(document))) {
        const openId = find.index + find[0].length - 1;
        const closeId = findClosing(document, openId, "{", "}");
        if (closeId === -1) {
            break;
        }
        const name = find[1];
        let replacement;
        if (name) {
            warnings += warnAndComment(
                `Not converted: Perl subroutine \`${name}\``,
            );
            const semicolon = document.slice(closeId + 1).match(/^\s*;/);
            replacement = semicolon ? "" : ";";
            document =
                document.slice(0, find.index) +
                replacement +
                document.slice(closeId + 1 + (semicolon?.[0].length ?? 0));
        } else {
            replacement = `sub {⟦checker${checkers.length}⟧}`;
            checkers.push(document.slice(openId + 1, closeId));
            document =
                document.slice(0, find.index) +
                replacement +
                document.slice(closeId + 1);
        }
        subRegex.lastIndex = find.index + replacement.length;
    }
    return [document, warnings, checkers];
}

/**
 * WeBWorK can show different things on screen and in printed (TeX) copies:
 *
 *     if ($displayMode eq 'TeX') { ...print version... } else { ...web version... }
 *
 * Keep only the web version.
 */
function dropTexDisplayMode(document) {
    const ifRegex =
        /\bif\s*\(\s*\$displayMode\s*(eq|ne)\s*["']TeX["']\s*\)\s*\{/g;
    let find;
    while ((find = ifRegex.exec(document))) {
        const ifClose = findClosing(
            document,
            find.index + find[0].length - 1,
            "{",
            "}",
        );
        if (ifClose === -1) {
            break;
        }
        const findElse = document.slice(ifClose + 1).match(/^\s*else\s*\{/);
        let elseBody = "";
        let endId = ifClose + 1;
        if (findElse) {
            const elseOpen = ifClose + findElse[0].length;
            const elseClose = findClosing(document, elseOpen, "{", "}");
            if (elseClose === -1) {
                break;
            }
            elseBody = document.slice(elseOpen + 1, elseClose);
            endId = elseClose + 1;
        }
        const ifBody = document.slice(find.index + find[0].length, ifClose);
        const webVersion = find[1] === "eq" ? elseBody : ifBody;
        document =
            document.slice(0, find.index) + webVersion + document.slice(endId);
        ifRegex.lastIndex = find.index;
    }
    return document;
}

/**
 * A Perl string expression, as it would appear in a TEXT section:
 *
 *     "\( x = \)" . $m->ans_rule(20) . $BR   ->   \( x = \) \{$m->ans_rule(20)\} $BR
 */
function perlToText(expression) {
    return splitTopLevel(expression.replace(/\s*\.\s*(?=["'$])/g, ","))
        .map((piece) => {
            const findString = piece.match(/^(["'])([\s\S]*)\1$/);
            if (findString) {
                return findString[2];
            }
            if (/^\$\w+->\w+\(.*\)$/.test(piece)) {
                return `\\{${piece}\\}`;
            }
            return piece;
        })
        .join(" ");
}

/**
 * Convert simple TeX to a math expression DoenetML can evaluate:
 * \frac{a}{b} -> (a)/(b), x^{n} -> x^(n), \cdot -> *. Returns null if there
 * is TeX it doesn't know.
 */
function texToMath(tex) {
    let math = tex
        .replace(/^\s*\\[([]\s*/, "")
        .replace(/\s*\\[)\]]\s*$/, "")
        .replaceAll(/\\(displaystyle|left|right|,|;|!)/g, " ")
        .replaceAll(/\\(cdot|times)\b/g, "*");

    // \frac{a}{b}, innermost first
    let find;
    while ((find = math.match(/\\frac\s*\{/))) {
        const numOpen = find.index + find[0].length - 1;
        const numClose = findClosing(math, numOpen, "{", "}");
        const denOpen = math.indexOf("{", numClose);
        if (
            numClose === -1 ||
            denOpen === -1 ||
            math.slice(numClose + 1, denOpen).trim()
        ) {
            return null;
        }
        const denClose = findClosing(math, denOpen, "{", "}");
        if (denClose === -1) {
            return null;
        }
        math =
            math.slice(0, find.index) +
            `(${math.slice(numOpen + 1, numClose)})/(${math.slice(denOpen + 1, denClose)})` +
            math.slice(denClose + 1);
    }
    if (math.includes("\\")) {
        return null;
    }
    return math
        .replaceAll("{", "(")
        .replaceAll("}", ")")
        .replace(/\s+/g, " ")
        .trim();
}

// Words that can appear in a math expression, so don't mean "this is text"
const mathWords = new Set(
    "sin cos tan sec csc cot arcsin arccos arctan sinh cosh tanh log ln exp sqrt abs pi inf infinity".split(
        " ",
    ),
);

/**
 * Convert one element of a Perl array to a named DoenetML component
 */
function arrayElement(name, element) {
    const findFunc = element.match(/^(\w+)\(([\s\S]*)\)$/);
    if (findFunc) {
        const [open, child, close] = functionStatement(
            name,
            findFunc[1],
            findFunc[2],
            0,
        );
        return open + child + close;
    }

    let value = element.replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
    const findTex =
        value.match(/^\\\(([\s\S]*)\\\)$/) ??
        value.match(/^\\\[([\s\S]*)\\\]$/);
    if (findTex) {
        value = findTex[1].trim();
    }

    if (value.includes("\\")) {
        return `<math name="${name}" format="latex">${spaceLessThan(value)}</math>`;
    }
    if (/^-?\d+(\.\d+)?$/.test(value)) {
        return `<number name="${name}">${value}</number>`;
    }
    const words = value.match(/[A-Za-z]{3,}/g) ?? [];
    if (!findTex && words.some((w) => !mathWords.has(w.toLowerCase()))) {
        return `<text name="${name}">${spaceLessThan(value)}</text>`;
    }
    return `<math name="${name}">${spaceLessThan(value)}</math>`;
}

/**
 * Build a header comment from the WeBWorK metadata tags
 * (`## Author(...)`, `## DESCRIPTION ... ## ENDDESCRIPTION`)
 */
function headerComment(data) {
    const author = data.match(/##\s*Author\s*\(\s*'?([^')]*?)'?\s*\)/i)?.[1];

    let description = "";
    const findDescription = data.match(
        /##\s*DESCRIPTION(.*?)##\s*ENDDESCRIPTION/is,
    );
    if (findDescription) {
        description = findDescription[1]
            .split(/\r?\n/)
            .map((line) => line.replace(/^\s*#+/, "").trim())
            .filter((line) => line !== "")
            .join(" ");
    }

    const stars = "*".repeat(60);
    return `<!--${stars}
Author: ${commentSafe(author || "Unknown")} - WeBWorK OPL
Reviewed/Remixed by:

About the problem: ${commentSafe(description)}
${stars}-->
`;
}

/**
 *
 * @param {string} name - variable name, no $
 * @param {string} func -
 * @param {string} argsString - everything between parenthesis
 * @returns
 */
function functionStatement(
    name,
    func,
    argsString,
    graphicalStyleCount,
    colorStyles = new Map(),
) {
    let args = splitArgs(argsString);

    let nameStr = name ? ` name="${name}"` : "";

    let open = "";
    let child = "";
    let close = "";
    if (func === "random") {
        // <selectFromSequence>
        let step =
            args[2] === "1" || args[2] === undefined
                ? ""
                : ` step="${args[2]}"`;
        open = `<selectFromSequence${nameStr} from="${args[0]}" to="${args[1]}"${step}/>`;
    } else if (func === "list_random") {
        // <select> one of the listed values. splitArgs drops quotes, which
        // tell strings from math here.
        const values = splitTopLevel(argsString).map((arg) => arg.trim());
        const unquote = (s) => s.replace(/^(["'])([\s\S]*)\1$/, "$2");
        const quoted = values.every((arg) => /^(["'])[\s\S]*\1$/.test(arg));
        if (values.every((arg) => arg !== "" && Number.isFinite(Number(arg)))) {
            open = `<select${nameStr} type="number">`;
            child = values.join(" ");
        } else if (
            quoted &&
            values.every((arg) => /^\S+$/.test(unquote(arg)))
        ) {
            open = `<select${nameStr} type="text">`;
            child = values.map(unquote).join(" ");
        } else {
            // Values with spaces, or expressions: one <option> each. They
            // go in `open`, since `child` is read as math.
            const tag = quoted ? "text" : "math";
            open =
                `<select${nameStr}>` +
                values
                    .map(
                        (arg) =>
                            `<option><${tag}>${quoted ? unquote(arg) : arg}</${tag}></option>`,
                    )
                    .join("");
        }
        close = "</select>";
    } else if (func === "non_zero_random") {
        // <selectFromSequence>, exclude 0
        let step =
            args[2] === "1" || args[2] === undefined
                ? ""
                : ` step="${args[2]}"`;
        // Only exclude 0 if it can be selected
        const [from, to] = [Number(args[0]), Number(args[1])];
        const exclude =
            Number.isFinite(from) && Number.isFinite(to) && (from > 0 || to < 0)
                ? ""
                : ` exclude="0"`;
        open = `<selectFromSequence${nameStr} from="${args[0]}" to="${args[1]}"${step}${exclude}/>`;
    } else if (func === "Real") {
        // <number>
        open = `<number${nameStr}>`;
        child = `${args[0]}`;
        close = "</number>";
    } else if (func === "Compute") {
        // <math>
        open = `<math${nameStr} simplify="full">`;
        child = `${args[0]}`;
        close = "</math>";
    } else if (func === "ImplicitPlane" || func === "Formula") {
        // <math> with equation
        open = `<math${nameStr} simplify="numbersPreserveOrder">`;
        child = `${args[0]}`;
        close = `</math>`;
    } else if (func === "List") {
        // <mathList>
        open = `<mathList${nameStr}>`;
        let list = "";
        for (let arg of args) {
            list += arg + " ";
        }
        list = list.slice(0, -1);
        child = list;
        close = `</mathList>`;
    } else if (func === "Interval") {
        // <interval>
        open = `<math${nameStr}><interval>`;
        child = `${args[0]}`;
        close = `</interval></math>`;
    } else if (func === "Union") {
        // <interval> with union
        args[0] = args[0].replaceAll(/\s+U\s+/g, " union ");
        open = `<math${nameStr}><interval>`;
        child = `${args[0]}`;
        close = `</interval></math>`;
    } else if (func === "FEQ") {
        // <function>
        // Curves of the same color share a styleNumber, so e.g. all the
        // blue curves of a problem look alike. Blue and red are DoenetML's
        // default styles 1 and 2; other colors get the next free style.
        const color = args[0].match(/color:\s*(\w+)/)?.[1]?.toLowerCase();
        let styleNumber =
            DEFAULT_COLOR_STYLES.get(color) ?? colorStyles.get(color);
        if (styleNumber === undefined) {
            do {
                graphicalStyleCount++;
            } while (
                [...DEFAULT_COLOR_STYLES.values()].includes(graphicalStyleCount)
            );
            styleNumber = graphicalStyleCount;
            if (color) {
                colorStyles.set(color, styleNumber);
            }
        }
        let funcDef = args[0].match(/(.*)\sfor\sx\sin\s<(.*),(.*)>/);
        if (funcDef) {
            // Dashed usually means a strict inequality, so keep it
            const lineStyle = /line:\s*dashed/.test(args[0])
                ? ` lineStyle="dashed"`
                : "";
            open = `<function${nameStr} domain="[${funcDef[2]},${funcDef[3]}]" stylenumber="${styleNumber}"${lineStyle}>`;
            child = `${funcDef[1]}`;
            close = `</function>`;
        } else {
            open = warnAndComment(
                `FEQ function does not match expected pattern: ${args[0]}`,
            );
        }
    } else {
        open = warnAndComment(`Unknown function ${func}`);
    }

    return [open, child, close, graphicalStyleCount];
}

/**
 * Convert init_graph line
 */
function graphOpenTag(argsString) {
    let args = splitArgs(argsString);

    const xmin = args[0];
    const ymin = args[1];
    const xmax = args[2];
    const ymax = args[3];

    return `<graph xmin="${xmin}" xmax="${xmax}" ymin="${ymin}" ymax="${ymax}" grid="1 1">`;
}

function graphWithContents(graphName, context) {
    const { graphs, graphContents, graphRegions, graphLabels } = context;
    if (!graphs[graphName]) {
        return warnAndComment(`Graph not found: ${graphName}`);
    }
    const label = graphLabels[graphName];
    let out = graphs[graphName] + "\n";
    out += `${tab}<!-- TODO: describe this graph for screen readers, without giving away the answer -->\n`;
    out += `${tab}<shortDescription>${label ? `Graph ${label}` : "A graph"}</shortDescription>\n`;
    for (let child of graphContents[graphName] ?? []) {
        out += tab + child + "\n";
    }
    if (graphRegions[graphName]) {
        out += tab + graphRegions[graphName].trim() + "\n";
    }
    out += "</graph>";
    return out;
}

/**
 * Parse a table of graphs:
 *
 *     BeginTable().
 *       Row([image(insertGraph($graph1),...), image(insertGraph($graph2),...)],@ops).
 *       AlignedRow([bold('A'), bold('B')],@ops).
 *       ...
 *     EndTable()
 *
 * A row of labels after a row of graphs labels those graphs.
 *
 * @returns {{graphs: (string|null)[], labels: string[]}[]} one entry per row of graphs
 */
function parseTable(value) {
    let rows = [];
    for (let row of value.matchAll(/Row\(\s*\[([\s\S]*?)\]/g)) {
        const cells = splitTopLevel(row[1]);
        const rowGraphs = cells.map(
            (cell) => cell.match(/insertGraph\(\s*\$(\w+)\s*\)/)?.[1] ?? null,
        );
        if (rowGraphs.some((graphName) => graphName)) {
            rows.push({ graphs: rowGraphs, labels: [] });
        } else if (rows.length > 0) {
            // e.g. bold('A') -> A
            rows.at(-1).labels = cells.map((cell) =>
                cell
                    .replace(/^\w+\(\s*([\s\S]*?)\s*\)$/, "$1")
                    .replace(/^(["'])([\s\S]*)\1$/, "$2"),
            );
        }
    }
    return rows;
}

/**
 * Render a table of graphs: a <sideBySide> per row, each graph in a
 * <figure> captioned with its label
 */
function tableBlock(rows, context) {
    let out = "";
    for (let { graphs: rowGraphs, labels } of rows) {
        out += "<sideBySide>\n";
        rowGraphs.forEach((graphName, i) => {
            if (!graphName) {
                return;
            }
            const graph = graphWithContents(graphName, context).replaceAll(
                "\n",
                `\n${tab}${tab}`,
            );
            const caption = labels[i] ? `<caption>${labels[i]}</caption>` : "";
            out += `${tab}<figure suppressFigureNameInCaption>\n${tab}${tab}${graph}\n${tab}${tab}${caption}\n${tab}</figure>\n`;
        });
        out += "</sideBySide>\n";
    }
    return out.trim();
}

/**
 * Render a select list (`\{$sl->print_q\}`): each question becomes a list
 * item holding a drop-down whose choices are all the answers that appear in
 * the list (e.g. A, B, C, D or T, F).
 *
 * WeBWorK shows `numToShow` of the questions in random order. The order is
 * picked in <setup> (`ord`), and both the list and the <givenAnswer> read
 * the questions (`questions`) and their answers (`keys`) through it, so the
 * two are always in the same order.
 *
 * The <label> goes inside the <choiceInput>: an <answer>'s own label only
 * reaches an input the answer makes itself.
 */
function selectListBlock(list, answerRecords, context) {
    const allAnswers = [...new Set(list.pairs.map(([, answer]) => answer))];
    allAnswers.sort();
    const numQuestions = list.pairs.length;
    const numToShow = Math.min(list.numToShow || numQuestions, numQuestions);

    const ord = uniqueSetupName("ord", context);
    const questions = uniqueSetupName("questions", context);
    const keys = uniqueSetupName("keys", context);

    const questionLabels = list.pairs
        .map(([question]) => `${tab}<label>${convertTex(question)}</label>\n`)
        .join("");
    const answers = list.pairs.map(([, answer]) => answer);
    const keysOut = answers.every((answer) => /^[^\s,]+$/.test(answer))
        ? `<textList name="${keys}">${answers.join(" ")}</textList>`
        : `<group name="${keys}">${answers.map((answer) => `<text>${answer}</text>`).join("")}</group>`;
    context.extraSetup.push(
        `<!-- random order of the questions: item i of the list shows question ${ord}[i] -->\n` +
            `<selectFromSequence name="${ord}" from="1" to="${numQuestions}" numToSelect="${numToShow}"/>\n` +
            `<group name="${questions}">\n${questionLabels}</group>\n` +
            keysOut,
    );

    const choices = allAnswers
        .map((choice) => `${tab}${tab}<choice>${choice}</choice>\n`)
        .join("");
    let items = "";
    let givenItems = "";
    for (let i = 1; i <= numToShow; i++) {
        const question = `$${questions}[$${ord}[${i}]]`;
        const key = `$${keys}[$${ord}[${i}]]`;
        // The whole list goes in the first record's <givenAnswer>
        answerRecords.push({ givenAnswer: "" });
        const number = answerRecords.length;
        items +=
            `${tab}<li>\n` +
            `${tab}${tab}<choiceInput inline name="ci${number}">${question}\n${choices}${tab}${tab}</choiceInput>\n` +
            `${tab}${tab}<answer inline name="ans${number}" forceSmallCheckWorkButton><award><when>$ci${number} = ${key}</when></award></answer>\n` +
            `${tab}</li>\n`;
        givenItems += `${tab}<li>${question}: ${key}</li>\n`;
    }
    answerRecords.at(-numToShow).givenAnswer = `<ol>\n${givenItems}</ol>`;

    return `<ol>\n${items}</ol>`;
}

/**
 * `base`, or `base2`, `base3`, ... if that's already a name in <setup>
 */
function uniqueSetupName(base, context) {
    let name = base;
    for (let i = 2; context.setupNames.has(name); i++) {
        name = `${base}${i}`;
    }
    context.setupNames.add(name);
    return name;
}

/**
 * Render a pop-up menu (`\{$popup->menu\}`) as a drop-down <answer>.
 *
 * If the correct choice depends on `if` blocks in the Perl, check the
 * selected choice against each condition in an <award>.
 */
function popupAnswer(name, popup, description, answerRecords) {
    const { choices, correct } = popup;
    // e.g. "Answer:" -> "Answer"
    description = description.replace(/[\s:]+$/, "");
    const shortDescription = `<shortDescription>${description}</shortDescription>`;

    // Conditions only matter if they lead to different answers
    const conditional =
        new Set(correct.map(({ value }) => value)).size > 1 ||
        (correct.length === 1 && correct[0].condition !== "");
    const canConvertConditions = correct.every(
        ({ condition, hasElse }) => condition !== "" && !hasElse,
    );

    if (!conditional || !canConvertConditions) {
        const value = correct.at(-1).value;
        answerRecords.push({ givenAnswer: `<p>${description}: ${value}</p>` });
        const choicesOut = choices
            .map((choice) =>
                choice === value
                    ? `<choice credit="1">${choice}</choice>`
                    : `<choice>${choice}</choice>`,
            )
            .join("");
        const warning = conditional
            ? warnAndComment(
                  `Correct answer for ${name} depends on an else block; check it by hand`,
              ).trim()
            : "";
        return `${warning}<answer inline name="${name}">${shortDescription}${choicesOut}</answer>`;
    }

    const inputName = `${name}Input`;
    const when = correct
        .map(
            ({ condition, value }) =>
                `(${condition} and $${inputName}.selectedIndices = ${choices.indexOf(value) + 1})`,
        )
        .join(" or ");
    const cases = correct
        .map(
            ({ condition, value }) =>
                `<case condition="${escapeAttribute(condition)}"><p>${description}: ${value}</p></case>`,
        )
        .join("");
    answerRecords.push({
        givenAnswer: `<conditionalContent>${cases}</conditionalContent>`,
    });
    const choicesOut = choices
        .map((choice) => `<choice>${choice}</choice>`)
        .join("");
    return `<answer inline name="${name}">${shortDescription}<choiceInput inline name="${inputName}">${choicesOut}</choiceInput><award><when>${spaceLessThan(when)}</when></award></answer>`;
}

/**
 * WeBWorK's std_problem_grader gives credit only when every answer is right.
 * DoenetML has no setting for that, so each <answer> becomes just its input,
 * and one <answer> after the last input requires all of their conditions.
 * It goes after the list if the last input is in one (e.g. a select list).
 *
 * Returns null, to leave the answers as they are, if the problem has
 * <part>s or an answer isn't one of the forms answerAsInput() knows.
 */
function combineAnswers(text) {
    const matches = [
        ...text.matchAll(/<answer\b([^>]*)>([\s\S]*?)<\/answer>/g),
    ];
    if (matches.length < 2) {
        return text;
    }
    if (/<part>/.test(text)) {
        return null;
    }

    let out = "";
    let lastId = 0;
    let insertAt = 0;
    const conditions = [];
    for (const match of matches) {
        const [whole, attributes, inner] = match;
        const name = attributes.match(/name="(\w+)"/)?.[1];
        const converted = name && answerAsInput(name, inner);
        if (!converted) {
            return null;
        }
        conditions.push(converted.condition);
        let start = match.index;
        let end = match.index + whole.length;
        if (converted.input === "") {
            // An answer on a line of its own: remove the line
            const lineStart = text.lastIndexOf("\n", start - 1) + 1;
            if (
                /^[ \t]*$/.test(text.slice(lineStart, start)) &&
                text[end] === "\n"
            ) {
                start = lineStart;
                end++;
            }
        }
        out += text.slice(lastId, start) + converted.input;
        lastId = end;
        insertAt = out.length;
    }
    out += text.slice(lastId);

    // After the list, if the last input is in one
    const before = out.slice(0, insertAt);
    const openLists =
        (before.match(/<ol\b/g) ?? []).length -
        (before.match(/<\/ol>/g) ?? []).length;
    let answerOut = `<answer name="ans1"><shortDescription>Check all answers</shortDescription><award><when>${conditions.join(" and ")}</when></award></answer>`;
    if (openLists > 0) {
        insertAt = out.indexOf("</ol>", insertAt) + "</ol>".length;
        answerOut = `\n${answerOut}`;
    }
    return out.slice(0, insertAt) + answerOut + out.slice(insertAt);
}

/**
 * One <answer> as its input and the condition for it to be right:
 *
 * - `<label/>$a` (a math answer) -> a <mathInput>, `$input = $a`
 * - <choice>s, one with credit="1" -> a <choiceInput>,
 *   `$input.selectedIndices = k`
 * - a <choiceInput> and an <award><when> -> the <choiceInput>, the condition
 * - just <award><when>s, for inputs outside the answer (select lists,
 *   any-order MultiAnswers) -> no input, any of the conditions
 *
 * A <label> or <shortDescription> moves to the input. null for anything
 * else.
 */
function answerAsInput(name, inner) {
    let rest = inner;
    let describe = "";
    let find;
    while ((find = rest.match(/^<(label|shortDescription)>[\s\S]*?<\/\1>/))) {
        describe += find[0];
        rest = rest.slice(find[0].length);
    }
    const inputName = `${name}Input`;

    // A math answer
    if (rest.trim() !== "" && !/[<>]/.test(rest)) {
        return {
            input: `<mathInput name="${inputName}">${describe}</mathInput>`,
            condition: `$${inputName} = ${rest.trim()}`,
        };
    }

    // <choice>s, one of them right
    if (/^(<choice( credit="1")?>[^<]*<\/choice>)+$/.test(rest)) {
        const choices = [...rest.matchAll(/<choice( credit="1")?>/g)];
        const right = choices.findIndex((choice) => choice[1]);
        if (right < 0 || choices.filter((choice) => choice[1]).length > 1) {
            return null;
        }
        return {
            input: `<choiceInput inline name="${inputName}">${describe}${rest.replaceAll(' credit="1"', "")}</choiceInput>`,
            condition: `$${inputName}.selectedIndices = ${right + 1}`,
        };
    }

    // A <choiceInput> and the condition for it
    if (
        (find = rest.match(
            /^(<choiceInput\b[^>]*>)([\s\S]*?<\/choiceInput>)<award><when>([\s\S]*?)<\/when><\/award>$/,
        ))
    ) {
        return {
            input: find[1] + describe + find[2],
            condition: `(${find[3]})`,
        };
    }

    // Conditions on inputs outside the answer
    const whens = [
        ...rest.matchAll(/<award><when>([\s\S]*?)<\/when><\/award>/g),
    ];
    if (
        whens.length > 0 &&
        rest
            .replaceAll(/<award><when>[\s\S]*?<\/when><\/award>/g, "")
            .trim() === ""
    ) {
        const condition =
            whens.length === 1
                ? `(${whens[0][1]})`
                : `(${whens.map((when) => `(${when[1]})`).join(" or ")})`;
        return { input: "", condition };
    }

    return null;
}

/**
 * Whether a MultiAnswer's checker accepts its two parts in either order:
 *
 *     my ( $f1stu, $f2stu ) = @{$student};
 *     my ( $f1, $f2 ) = @{$correct};
 *     if ( ($f1 == $f1stu && $f2 == $f2stu) ||
 *          ($f1 == $f2stu && $f2 == $f1stu) ) {
 *         return [1,1];
 *     } ...
 *
 * Only when its first `if` is exactly that, giving full credit, and each
 * part is a variable or a number.
 */
function isAnyOrderChecker(checker, parts) {
    if (
        !checker ||
        parts.length !== 2 ||
        !parts.every((part) => /^(\$\w+|-?\d+(\.\d+)?)$/.test(part.trim()))
    ) {
        return false;
    }
    // my ($correct, $student, $self) = @_;
    const params = checker.match(
        /my\s*\(\s*\$(\w+)\s*,\s*\$(\w+)[^)]*\)\s*=\s*@_/,
    );
    if (!params) {
        return false;
    }
    const unpack = (arrayName) =>
        checker.match(
            new RegExp(
                `my\\s*\\(\\s*\\$(\\w+)\\s*,\\s*\\$(\\w+)\\s*\\)\\s*=\\s*@\\{\\s*\\$${arrayName}\\s*\\}`,
            ),
        );
    const correct = unpack(params[1]);
    const student = unpack(params[2]);
    if (!correct || !student) {
        return false;
    }

    const ifMatch = /\bif\s*\(/.exec(checker);
    if (!ifMatch) {
        return false;
    }
    const conditionOpen = ifMatch.index + ifMatch[0].length - 1;
    const conditionClose = findClosing(checker, conditionOpen);
    const bodyOpen = checker.indexOf("{", conditionClose);
    const bodyClose = findClosing(checker, bodyOpen, "{", "}");
    if (conditionClose < 0 || bodyOpen < 0 || bodyClose < 0) {
        return false;
    }
    const body = checker.slice(bodyOpen + 1, bodyClose);
    if (!/^\s*return\s*(\[\s*1\s*,\s*1\s*\]|1)\s*;?\s*$/.test(body)) {
        return false;
    }

    // Each `a == b` as "a=b" with the sides sorted, each clause as its
    // sorted equalities
    const equality = (a, b) => [a, b].sort().join("=");
    const clauseKey = (equalities) => equalities.sort().join("&");
    const condition = checker
        .slice(conditionOpen + 1, conditionClose)
        .replaceAll(/\s|\$/g, "");
    let clauses;
    try {
        clauses = condition.split("||").map((clause) => {
            const equalities = clause
                .replace(/^\(+/, "")
                .replace(/\)+$/, "")
                .split("&&")
                .map((eq) => {
                    const sides = eq.split("==");
                    if (sides.length !== 2 || /[()]/.test(eq)) {
                        throw new Error("not a simple equality");
                    }
                    return equality(...sides);
                });
            return clauseKey(equalities);
        });
    } catch {
        return false;
    }
    const [, c1, c2] = correct;
    const [, s1, s2] = student;
    const expected = [
        clauseKey([equality(c1, s1), equality(c2, s2)]),
        clauseKey([equality(c1, s2), equality(c2, s1)]),
    ];
    return (
        clauses.length === 2 &&
        expected.every((key) => clauses.includes(key)) &&
        clauses[0] !== clauses[1]
    );
}

/**
 * The <answer> for an any-order group of inputs: full credit for either
 * order of the parts
 */
function anyOrderAnswer(group, name) {
    const [input1, input2] = group.inputs;
    const [part1, part2] = group.parts.map((part) => part.trim());
    const what = group.lhs.every((lhs) => lhs)
        ? group.lhs.join(" and ")
        : "both answers";
    const note = group.partialCredit
        ? warnAndComment(
              `Not converted: partial credit for one correct part of a MultiAnswer; ${name} needs both`,
          ).trim()
        : "";
    return (
        `${note}<answer name="${name}"><shortDescription>Check ${what}</shortDescription>` +
        `<award><when>$${input1} = ${part1} and $${input2} = ${part2}</when></award>` +
        `<award><when>$${input1} = ${part2} and $${input2} = ${part1}</when></award></answer>`
    );
}

/**
 * Both orders of an any-order group, for the <givenAnswer>
 */
function anyOrderGivenAnswer(group) {
    const [lhs1, lhs2] = group.lhs;
    const [part1, part2] = group.parts.map((part) => part.trim());
    const pair = (a, b) =>
        lhs1 && lhs2
            ? `<m>${lhs1} = ${a},\\; ${lhs2} = ${b}</m>`
            : `<m>${a},\\; ${b}</m>`;
    return `<p>${pair(part1, part2)}</p>\n<p>or</p>\n<p>${pair(part2, part1)}</p>`;
}

/**
 * A two-part MultiAnswer shown as a fraction becomes one answer for the
 * whole fraction. Its custom checker, if any, is translated into awards:
 *
 * - `$f1*$f2stu == $f1stu*$f2` (equivalent fraction) with a message like
 *   "Simplify your answer further": the correct answer then has to be in
 *   reduced form (symbolicEquality), and an equivalent unreduced answer
 *   gets 0 credit and the message.
 * - `$numbogus == $f1stu || $denbogus == $f2stu` (a common mistake) with a
 *   message: that mistake gets 0 credit and the message.
 *
 * Other branches are listed in a comment to convert by hand.
 *
 * @returns {{ content: string, given: string, feedback: string }}
 */
function fractionAnswer({ parts: [num, den], checker }, name) {
    const given = `\\frac{${num}}{${den}}`;
    if (!checker) {
        return { content: `${num}/${den}`, given, feedback: "" };
    }

    // Names the checker uses for the student's and the correct parts
    const partNames = (source) =>
        checker
            .match(
                new RegExp(
                    String.raw`my\s*\(\s*\$(\w+)\s*,\s*\$(\w+)\s*\)\s*=\s*@\{\s*\$${source}\s*\}`,
                ),
            )
            ?.slice(1);
    const student = partNames("student");
    const correct = partNames("correct");
    if (!student || !correct) {
        return {
            content:
                warnAndComment(
                    `Not converted: custom checker for MultiAnswer; check the answer by hand`,
                ).trim() + `${num}/${den}`,
            given,
            feedback: "",
        };
    }
    const sameSet = (a, b) =>
        a.length === b.length && a.every((x) => b.includes(x));

    let needsSimplify = null;
    let mistakes = [];
    let unconverted = [];
    const branchRegex = /\b(?:if|elsif)\s*\(/g;
    let find;
    while ((find = branchRegex.exec(checker))) {
        const conditionOpen = find.index + find[0].length - 1;
        const conditionClose = findClosing(checker, conditionOpen);
        const bodyOpen = checker.indexOf("{", conditionClose);
        const bodyClose = findClosing(checker, bodyOpen, "{", "}");
        if (conditionClose === -1 || bodyOpen === -1 || bodyClose === -1) {
            break;
        }
        const condition = checker.slice(conditionOpen + 1, conditionClose);
        const body = checker.slice(bodyOpen + 1, bodyClose);
        const message = body.match(
            /setMessage\(\s*\d+\s*,\s*(["'])([\s\S]*?)\1/,
        )?.[2];
        if (!message) {
            continue;
        }

        // Equivalent fraction: $f1*$f2stu == $f1stu*$f2 (in any order)
        const findCross = condition
            .replace(/[\s()]/g, "")
            .match(/^\$(\w+)\*\$(\w+)==\$(\w+)\*\$(\w+)$/);
        if (findCross) {
            const left = [findCross[1], findCross[2]];
            const right = [findCross[3], findCross[4]];
            const side1 = [correct[0], student[1]];
            const side2 = [student[0], correct[1]];
            if (
                (sameSet(left, side1) && sameSet(right, side2)) ||
                (sameSet(left, side2) && sameSet(right, side1))
            ) {
                needsSimplify ??= message;
                continue;
            }
        }

        // A mistake: some part of the student's answer == some formula
        let mistakeParts = [null, null];
        for (let [, x, y] of condition.matchAll(/\$(\w+)\s*==\s*\$(\w+)/g)) {
            student.forEach((studentPart, i) => {
                const other =
                    x === studentPart ? y : y === studentPart ? x : null;
                if (other && !correct.includes(other)) {
                    mistakeParts[i] = `$${other}`;
                }
            });
        }
        if (mistakeParts.some((part) => part)) {
            mistakes.push({
                answer: `${mistakeParts[0] ?? num}/${mistakeParts[1] ?? den}`,
                message,
            });
        } else {
            unconverted.push(message);
        }
    }

    let content = needsSimplify
        ? `\n  <award credit="1" symbolicEquality>${num}/${den}</award>` +
          `\n  <!-- Other reduced forms (e.g. (a/b) x^k) need their own symbolicEquality award -->`
        : `\n  <award credit="1">${num}/${den}</award>`;
    let feedback = "";
    if (needsSimplify) {
        content += `\n  <award name="${name}Simplify" credit="0">${num}/${den}</award>`;
        feedback += `<feedback condition="$${name}Simplify">${needsSimplify}</feedback>\n`;
    }
    mistakes.forEach(({ answer, message }, i) => {
        const awardName = `${name}Mistake${i + 1}`;
        content += `\n  <award name="${awardName}" credit="0">${answer}</award>`;
        feedback += `<feedback condition="$${awardName}">${message}</feedback>\n`;
    });
    for (let message of unconverted) {
        content += `\n  ${warnAndComment(`Not converted: checker message "${message}"; add an award by hand`).trim()}`;
    }
    return { content: content + "\n", given, feedback };
}

/**
 * Text with tags removed, for a <shortDescription>
 */
function plainText(text) {
    return text
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * @param {string} text - contents of BEGIN_TEXT ... END_TEXT
 * @param {string[]} answers - correct answers, from the ANS() calls, in order
 * @param {object[]} answerRecords - each answer blank found is pushed here
 * @param {object} context - graphs, tables, select lists and pop-up menus
 */
function textSection(text, answers, answerRecords, context) {
    let out = "";

    // Text built in Perl, e.g. $showfraction = ColumnTable(...)
    text = text.replaceAll(
        /\$(\w+)\b/g,
        (match, name) => context.textSnippets[name] ?? match,
    );

    // A MultiAnswer with two parts shown as a fraction: numerator blank,
    // a line ($HR), denominator blank. Becomes one answer.
    text = text.replaceAll(
        /\\\{\s*\$(\w+)->ans_rule\([^)]*\)\s*\\\}\s*(?:\$\{?BR\}?\s*)?\$\{?HR\}?\s*\\\{\s*\$\1->ans_rule\([^)]*\)\s*\\\}/g,
        (match, name) =>
            context.multiAnswers[name]?.parts.length === 2
                ? `⟦fraction:${name}⟧`
                : match,
    );

    // WeBWorK's note about enlarging graph images: DoenetML graphs zoom
    // with their (+) button instead
    text = text.replaceAll(
        /You can click on the graphs? to enlarge the images?\./g,
        "Use the (+) symbol in the lower-right corner of the graph to zoom in.",
    );

    // Lines of text run together, like in HTML
    text = text.replace(/\s*(\r\n|\n|\r)\s*/g, " ");

    // Bold text: <alert>
    text = text.replaceAll("$BBOLD", "<alert>");
    text = text.replaceAll("${BBOLD}", "<alert>");
    text = text.replaceAll("$EBOLD", "</alert>");
    text = text.replaceAll("${EBOLD}", "</alert>");
    // Italic text: <em>
    text = text.replaceAll("$BITALIC", "<em>");
    text = text.replaceAll("${BITALIC}", "<em>");
    text = text.replaceAll("$EITALIC", "</em>");
    text = text.replaceAll("${EITALIC}", "</em>");
    // Centering
    text = text.replaceAll("$BCENTER", "");
    text = text.replaceAll("${BCENTER}", "");
    text = text.replaceAll("$ECENTER", "");
    text = text.replaceAll("${ECENTER}", "");
    // Block quotes
    text = text.replaceAll(/\$\{?[BE]BLOCKQUOTE\}?/g, "");
    // <m>, <me> and <md> tags
    text = convertTex(text);
    // Any unmatched delimiters left over
    text = text.replaceAll("\\(", "<m>");
    text = text.replaceAll("\\)", "</m>");
    text = text.replaceAll("\\[", "<me>");
    text = text.replaceAll("\\]", "</me>");

    // $PAR and $BR
    text = text.replaceAll("$PAR", "\n");
    text = text.replaceAll("${PAR}", "\n");
    text = text.replaceAll("$BR", "\n");
    text = text.replaceAll("${BR}", "\n");
    text = text.replaceAll("$HR", "\n");
    text = text.replaceAll("${HR}", "\n");

    text = text.trim();

    let multiAnswerPartsUsed = {};
    for (let par of text.split("\n")) {
        const numRecordsBefore = answerRecords.length;

        // <answer> tags
        par = insertAnswers(
            par,
            /\\?\{\s?ans_rule\(\s?\d+\s?\)\s?\\\}?/g,
            () => answers[answerRecords.filter((r) => r.blank).length],
            answerRecords,
        );

        // MultiAnswer shown as a fraction
        par = insertAnswers(
            par,
            /⟦fraction:(\w+)⟧/g,
            (match, name) =>
                fractionAnswer(context.multiAnswers[match[1]], name),
            answerRecords,
        );

        // Any other MultiAnswer blanks: an answer for each part, in order
        par = insertAnswers(
            par,
            /\\\{\s*\$(\w+)->ans_rule\([^)]*\)\s*\\\}/g,
            (match) => {
                const multiAnswer = context.multiAnswers[match[1]];
                if (!multiAnswer) {
                    return undefined;
                }
                const i = (multiAnswerPartsUsed[match[1]] ??= 0);
                multiAnswerPartsUsed[match[1]]++;
                if (multiAnswer.anyOrder) {
                    return {
                        input: `${match[1]}${i + 1}`,
                        group: multiAnswer.anyOrder,
                    };
                }
                const warning =
                    multiAnswer.checker && i === 0
                        ? warnAndComment(
                              `Not converted: custom checker for MultiAnswer $${match[1]}; check these answers by hand`,
                          ).trim()
                        : "";
                return {
                    content: warning + (multiAnswer.parts[i] ?? ""),
                    given: multiAnswer.parts[i],
                };
            },
            answerRecords,
        );

        // Pop-up menus: \{$popup->menu\}
        // Describe each by the text that follows it, up to the next menu
        const menuRegex = /\\\{\s*\$(\w+)->menu\s*\\\}/g;
        const menuMatches = [...par.matchAll(menuRegex)].filter(
            (match) => context.popups[match[1]],
        );
        if (menuMatches.length > 0) {
            let newPar = par.slice(0, menuMatches[0].index);
            menuMatches.forEach((match, i) => {
                const after = par.slice(
                    match.index + match[0].length,
                    menuMatches[i + 1]?.index,
                );
                const description =
                    plainText(after) || plainText(newPar) || "Answer";
                // popupAnswer() adds this answer's record
                const name = `ans${answerRecords.length + 1}`;
                newPar += popupAnswer(
                    name,
                    context.popups[match[1]],
                    description,
                    answerRecords,
                );
                newPar += after;
            });
            par = newPar;
        }

        // Select lists: \{$sl->print_q\}
        par = par.replaceAll(
            /\\\{\s*\$(\w+)->print_q\s*\\\}/g,
            (match, listName) =>
                context.selectLists[listName]
                    ? selectListBlock(
                          context.selectLists[listName],
                          answerRecords,
                          context,
                      )
                    : match,
        );

        // Tables of graphs: $imageTable
        par = par.replaceAll(/\$(\w+)\b/g, (match, tableName) =>
            context.tables[tableName]
                ? tableBlock(context.tables[tableName], context)
                : match,
        );

        // <graph> tags
        par = par.replaceAll(
            /\\\{\s*image\(\s*insertGraph\(\s*\$(\w+)\s*\)[^}]*\\\}/g,
            (match, graphName) => graphWithContents(graphName, context),
        );

        // A numbered question with an answer, like "1." or "(a)" (often in
        // bold), becomes a <part>, which numbers itself
        par = par.trim();
        const newRecords = answerRecords.slice(numRecordsBefore);
        const findNumber = par.match(
            /^(?:<alert>\s*\(?(?:\d+|[a-zA-Z])[.)]\s*<\/alert>|\(?(?:\d+|[a-zA-Z])[.)](?=\s))\s*/,
        );
        const isPart = findNumber && newRecords.length > 0;
        if (isPart) {
            par = par.slice(findNumber[0].length);
            for (let record of newRecords) {
                record.part = true;
            }
        }

        // Blocks (lists, tables, graphs) on their own aren't put in a <p>
        let parOut = "";
        if (
            /^<(ol|sideBySide|graph)\b[\s\S]*<\/(ol|sideBySide|graph)>$/.test(
                par,
            )
        ) {
            parOut += `${par}\n`;
        } else if (par !== "") {
            parOut += `<p>${par}</p>\n`;
        }

        // Feedback for answers in this paragraph goes right after it
        for (let record of newRecords) {
            parOut += record.feedback ?? "";
        }

        out += isPart
            ? `<part>\n${tab}${parOut.trim().replaceAll("\n", `\n${tab}`)}\n</part>\n`
            : parOut;
    }
    return out;
}

/**
 * Convert TeX math in a TEXT section:
 *   \( ... \)  -> <m>
 *   \[ ... \]  -> <me>, or <md> if it's just an aligned environment
 *   \begin{align} ... \end{align} (and align*, eqnarray) -> <md>
 *
 * Must be called on a single line: <md> output is kept on one line so it
 * stays inside its paragraph.
 */
function convertTex(text) {
    const regex = new RegExp(
        [
            String.raw`\\\[([\s\S]*?)\\\]`,
            String.raw`\\begin\{(align\*?|eqnarray\*?)\}([\s\S]*?)\\end\{\2\}`,
            String.raw`\\\(([\s\S]*?)\\\)`,
        ].join("|"),
        "g",
    );
    return text.replace(regex, (match, display, env, envBody, inline) => {
        if (inline !== undefined) {
            return `<m>${spaceLessThan(inline)}</m>`;
        }
        if (env !== undefined) {
            return alignedToMd(env, envBody);
        }
        const findAligned = display
            .trim()
            .match(
                /^\\begin\{(aligned|align\*?|eqnarray\*?)\}([\s\S]*)\\end\{\1\}$/,
            );
        if (findAligned) {
            return alignedToMd(findAligned[1], findAligned[2]);
        }
        return `<me>${spaceLessThan(display)}</me>`;
    });
}

/**
 * Rows of an aligned environment (separated by `\\`) become <mrow>s.
 * The `&` marking the alignment point is kept: it works the same in <mrow>.
 */
function alignedToMd(env, body) {
    let rows = body
        .split(/\\\\/)
        .map((row) => row.replaceAll(/\\(nonumber|notag)\b/g, "").trim())
        .filter((row) => row !== "");
    if (env.startsWith("eqnarray")) {
        // eqnarray marks both sides of the relation: `x &=& 5` -> `x &= 5`
        rows = rows.map((row) => row.replace(/&([^&]*)&/, "&$1"));
    }
    const mrows = rows.map((row) => `<mrow>${spaceLessThan(row)}</mrow>`);
    return `<md>${mrows.join("")}</md>`;
}

/**
 * Replace each answer blank matched by `regex` in `par` with an <answer>.
 * Text like `x =` (or `<m>x</m> =`) just before the blank becomes the
 * answer's <label>.
 */
function insertAnswers(par, regex, getAnswer, answerRecords) {
    let out = "";
    let lastId = 0;
    for (let match of par.matchAll(regex)) {
        const name = `ans${answerRecords.length + 1}`;
        // Either the correct answer, { content, given, feedback } for an
        // answer with its own awards, or { input, group } for one input of
        // an any-order group
        let answer = getAnswer(match, name);
        let before = par.slice(lastId, match.index);
        lastId = match.index + match[0].length;

        const findLabel =
            before.match(/<m>([^<]*?)\s*=\s*<\/m>\s*$/) ??
            before.match(/<m>([^<]*)<\/m>\s*=\s*$/) ??
            before.match(/([^\s<>=]+)\s*=\s*$/);
        let lhs = null;
        let label = "";
        if (findLabel) {
            lhs = findLabel[1].trim();
            label = `<label><m>${lhs} = </m></label>`;
            before = before.slice(0, findLabel.index);
        }

        if (answer?.input) {
            // The <answer> comes after the group's last input
            const group = answer.group;
            group.inputs.push(answer.input);
            group.lhs.push(lhs);
            out += `${before}<mathInput name="${answer.input}">${label}</mathInput>`;
            if (group.inputs.length === group.parts.length) {
                answerRecords.push({
                    blank: false,
                    givenAnswer: anyOrderGivenAnswer(group),
                });
                out += anyOrderAnswer(group, name);
            }
            continue;
        }

        let content = answer;
        let record = { blank: true };
        if (answer && typeof answer === "object") {
            content = answer.content;
            record = { blank: false, feedback: answer.feedback };
            answer = answer.given;
        }

        answerRecords.push({ lhs, answer, ...record });
        if (content === undefined) {
            out += before + warnAndComment(`No correct answer for ${name}`);
            out += `<answer name="${name}">${label}</answer>`;
        } else {
            out += `${before}<answer name="${name}">${label}${content}</answer>`;
        }
    }
    return out + par.slice(lastId);
}

function pgmlSection(pgml, answerRecords) {
    // <m> tags with \displaystyle
    pgml = pgml.replaceAll(
        /\[``([\s\S]*?)``\]/g,
        (match, tex) => `<m>\\displaystyle{${spaceLessThan(tex)}}</m>`,
    );
    // <m> tags
    pgml = pgml.replaceAll(
        /\[`([\s\S]*?)`\]/g,
        (match, tex) => `<m>${spaceLessThan(tex)}</m>`,
    );

    // references
    pgml = pgml.replaceAll(/\[(\$\w+)\]/g, "$1");

    // paragraph breaks
    pgml = pgml.replaceAll("\n\n", "⛓️‍💥");
    pgml = pgml.replaceAll("\r\n\r\n", "⛓️‍💥");
    pgml = pgml.replaceAll("\r\r", "⛓️‍💥");

    let out = "";
    for (let par of pgml.split("⛓️‍💥")) {
        par = insertAnswers(
            par,
            /\[_+\]\{(.*?)\}/g,
            (match) => match[1],
            answerRecords,
        );

        out += `<p>${par.trim()}\n</p>\n`;
    }
    return out;
}

function splitArgs(argsString) {
    argsString = argsString.replace(/<(.*),(.*)>/, "<$1🍩$2>");
    argsString = argsString.replace(/\((.*),(.*)\)/, "($1🍩$2)");

    let args = argsString
        .split(",")
        .map((arg) => arg.trim().replaceAll(`"`, ``));
    args = args.map((a) => a.replace("🍩", ","));
    return args;
}

/**
 * Given `str[openId] === open`, return the index of the matching `close`,
 * skipping over quoted strings. Returns -1 if there is none.
 */
function findClosing(str, openId, open = "(", close = ")") {
    let depth = 0;
    let quote = null;
    for (let i = openId; i < str.length; i++) {
        const c = str[i];
        if (quote) {
            if (c === "\\") {
                i++;
            } else if (c === quote) {
                quote = null;
            }
        } else if (c === `"` || c === `'`) {
            quote = c;
        } else if (c === open) {
            depth++;
        } else if (c === close) {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}

/**
 * Split Perl code into statements on `;`, ignoring any inside quoted
 * strings (e.g. the TeX thin space `\;`). Whitespace inside each statement,
 * including newlines, is collapsed to a single space.
 */
function splitStatements(code) {
    let statements = [];
    let quote = null;
    let startId = 0;
    for (let i = 0; i < code.length; i++) {
        const c = code[i];
        if (quote) {
            if (c === "\\") {
                i++;
            } else if (c === quote) {
                quote = null;
            }
        } else if (c === `"` || c === `'`) {
            quote = c;
        } else if (c === ";") {
            statements.push(code.slice(startId, i));
            startId = i + 1;
        }
    }
    statements.push(code.slice(startId));
    return statements.map((s) => s.replace(/\s+/g, " ").trim());
}

/**
 * Split on commas that aren't inside quotes or brackets
 */
function splitTopLevel(str) {
    let parts = [];
    let depth = 0;
    let quote = null;
    let startId = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (quote) {
            if (c === "\\") {
                i++;
            } else if (c === quote) {
                quote = null;
            }
        } else if (c === `"` || c === `'`) {
            quote = c;
        } else if ("([{".includes(c)) {
            depth++;
        } else if (")]}".includes(c)) {
            depth--;
        } else if (c === "," && depth === 0) {
            parts.push(str.slice(startId, i).trim());
            startId = i + 1;
        }
    }
    parts.push(str.slice(startId).trim());
    return parts.filter((part) => part !== "");
}

/**
 * DoenetML reads `<` as a less-than sign when a space or `=` follows it,
 * but as the start of a tag otherwise (`x<0`, `a<b`). Add the space.
 * Only use on math, never on text that may contain tags.
 */
function spaceLessThan(math) {
    return math.replace(/<(?![\s=])/g, "< ");
}

/**
 * Attribute values only need their quotes escaped; `<` and `&` are fine
 */
function escapeAttribute(str) {
    return str.replaceAll(`"`, "&quot;");
}

/**
 * XML comments can't contain `--`
 */
function commentSafe(str) {
    return str.replace(/-(?=-)/g, "- ");
}

/**
 * WeBWorK colors that match DoenetML's default styles: color -> styleNumber
 */
const DEFAULT_COLOR_STYLES = new Map([
    ["blue", 1],
    ["red", 2],
]);

/**
 * What a plotted <function> draws, ignoring its name and style: equal keys
 * are the same curve. null if it isn't a single, unconditional <function>.
 */
function curveKey(data) {
    if (
        !data?.open.startsWith("<function") ||
        data.childOptions.length !== 1 ||
        data.childOptions[0].condition !== ""
    ) {
        return null;
    }
    const domain = data.open.match(/domain="([^"]*)"/)?.[1];
    const lineStyle = data.open.match(/lineStyle="([^"]*)"/)?.[1];
    return JSON.stringify([domain, lineStyle, data.childOptions[0].value]);
}

function warnAndComment(message) {
    console.warn(message);
    return `<!-- ${commentSafe(message)} -->\n`;
}

/**
 * Usage: node convert.js [input.pg] [output.doenetml] [hide-original]
 */
export function main(args = process.argv.slice(2)) {
    const hideOriginal = args.includes("hide-original");

    const [inputFilepath = "input.pg", outputFilepath = "output.doenetml"] =
        args.filter((arg) => arg !== "hide-original");
    let data = "";
    try {
        data = fs.readFileSync(inputFilepath, "utf8");
    } catch (err) {
        console.error("Error reading file:", err);
        return;
    }

    let output = convert(data);
    if (!hideOriginal) {
        output += `
<!-- Generated from this WeBWorK problem: -->
<!--\n${commentSafe(data)}\n-->\n`;
    }

    try {
        fs.writeFileSync(outputFilepath, output);
    } catch (err) {
        console.error("Error writing output", err);
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main();
}
