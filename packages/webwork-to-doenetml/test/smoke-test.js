import assert from "node:assert/strict";

import { convert } from "../convert.js";

// Basic TEXT problem
const sampleProblem = String.raw`DOCUMENT();
BEGIN_TEXT
Solve \{ ans_rule(10) \}
END_TEXT

$a = Compute("x^2");
ANS($a);
ENDDOCUMENT();`;

let output = convert(sampleProblem);

assert.match(output, /<problem><title \/>/);
assert.match(output, /<math name="a" simplify="full">x\^2<\/math>/);
assert.match(output, /<p>Solve <answer name="ans1">\$a<\/answer><\/p>/);
assert.match(output, /<givenAnswer>\s*<p><m>\$a<\/m><\/p>\s*<\/givenAnswer>/);
assert.match(output, /<\/problem>\n$/);

// Arrays indexed by a random variable become a <select>, and text before an
// answer blank becomes its label (from OPL, author RA Cruz)
const arrayProblem = String.raw`## DESCRIPTION
## Word problem
## ENDDESCRIPTION
## Author(RA Cruz)
DOCUMENT();
loadMacros("PGstandard.pl", "MathObjects.pl");
TEXT(beginproblem());
Context()->variables->are(h=>'Real',
                          r=>'Real',
                          V=>'Real');

$n = random(0,1,1);
@var = ("h", "\(r^2\)");
@answer = (Formula("(3V)/(pi*r^2)"), Formula("(3V)/(pi*h)"));

BEGIN_TEXT
Solve for $BITALIC $var[$n]$EITALIC: \[ V = \frac{1}{3}\pi r^2 h \]
$PAR
$var[$n] =  \{ans_rule(15) \}
END_TEXT

$ans = $answer[$n];
ANS($ans->cmp);
$showPartialCorrectAnswers = 1;
ENDDOCUMENT();`;

output = convert(arrayProblem);

assert.match(output, /Author: RA Cruz - WeBWorK OPL/);
assert.match(output, /About the problem: Word problem/);
assert.match(
    output,
    /<select name="s1">\s*<option>\s*<math name="var">h<\/math>\s*<math name="answer"[^>]*>\(3V\)\/\(pi\*r\^2\)<\/math>\s*<\/option>\s*<option>\s*<math name="var">r\^2<\/math>/,
);
assert.match(output, /<math name="ans">\$s1\.answer<\/math>/);
assert.match(output, /Solve for <em> \$s1\.var<\/em>/);
assert.match(
    output,
    /<answer name="ans1"><label><m>\$s1\.var = <\/m><\/label>\$ans<\/answer>/,
);
assert.match(output, /<p><m>\$s1\.var = \$ans<\/m><\/p>/);
assert.doesNotMatch(output, /Unrecognized|selectFromSequence|\[\$n\]/);

// Arrays that don't fit the pattern are left alone
output = convert(String.raw`DOCUMENT();
$n = random(1,2,1);
@var = ("a", "b");
BEGIN_TEXT
\{ ans_rule(10) \}
END_TEXT
ANS($var[$n]);
ENDDOCUMENT();`);

assert.match(output, /Unrecognized pattern: @var/);
assert.doesNotMatch(output, /<select /);

// PGML
output = convert(
    [
        "DOCUMENT();",
        `$a = Compute("2");`,
        `$b = Compute("3");`,
        "BEGIN_PGML",
        "[`x =`] [_]{$a} and [`y`] = [_]{$b}",
        "END_PGML",
        "ENDDOCUMENT();",
    ].join("\n"),
);

assert.match(
    output,
    /<answer name="ans1"><label><m>x = <\/m><\/label>\$a<\/answer> and <answer name="ans2"><label><m>y = <\/m><\/label>\$b<\/answer>/,
);

// Conditionals
output = convert(String.raw`DOCUMENT();
$a = random(1,5,1);
if ($a < 3) { $b = Compute("1"); } else { $b = Compute("2"); }
BEGIN_TEXT
\{ ans_rule(10) \}
END_TEXT
ANS($b);
ENDDOCUMENT();`);

assert.match(output, /<case condition="\$a < 3">1<\/case>/);
assert.match(output, /<else>2<\/else>/);

// Math: `<` gets a space so DoenetML doesn't read it as a tag; `&` in
// cases is left alone; aligned environments become <md>/<mrow>;
// TEXT(beginproblem) without parentheses is skipped
output = convert(String.raw`DOCUMENT();
TEXT(beginproblem);
$a = Compute("x<2");
BEGIN_TEXT
Where is \(f(x)<0\)? \[ f(x) = \begin{cases} x & x\le 0 \\ 2 & x>0 \end{cases} \]
\[ \begin{aligned} y &= 2x+1 \\ y &= 3 \end{aligned} \]
\begin{eqnarray*} a &=& b \nonumber \\ c &<& d \end{eqnarray*}
\{ ans_rule(10) \}
END_TEXT
ANS($a);
ENDDOCUMENT();`);

assert.match(output, /<math name="a" simplify="full">x< 2<\/math>/);
assert.match(output, /<m>f\(x\)< 0<\/m>/);
assert.match(
    output,
    /<me> f\(x\) = \\begin\{cases\} x & x\\le 0 \\\\ 2 & x>0 \\end\{cases\} <\/me>/,
);
assert.match(output, /<md><mrow>y &= 2x\+1<\/mrow><mrow>y &= 3<\/mrow><\/md>/);
assert.match(output, /<md><mrow>a &= b<\/mrow><mrow>c &< d<\/mrow><\/md>/);
assert.doesNotMatch(output, /Unrecognized/);

// Perl subroutines become a single warning each
output = convert(String.raw`DOCUMENT();
sub bold {return $BBOLD.join("",@_).$EBOLD}
$a = Compute("2");
BEGIN_TEXT
\{ ans_rule(10) \}
END_TEXT
ANS($a->cmp(checker => sub {
    my ( $correct, $student, $ansHash ) = @_;
    return $correct == $student;
}));
ENDDOCUMENT();`);

assert.match(output, /Not converted: Perl subroutine `bold`/);
assert.match(output, /Not converted: custom answer checker/);
assert.match(output, /<answer name="ans1">\$a<\/answer>/);
assert.doesNotMatch(output, /Unrecognized/);

// Matching: a table of labeled graphs, with shading, and a select list
output = convert(String.raw`DOCUMENT();
$c = random(2,4,1);
$graph1 = init_graph(-8,-8,8,8,'axes'=>[0,0]);
$graph2 = init_graph(-8,-8,8,8,'axes'=>[0,0]);
$p1 = FEQ("-x+$c for x in <-8,8> using color:blue weight:2 line:dashed");
$p2 = FEQ("4 for x in <-8,2> using color:blue weight:2");
$graph2->moveTo(2,4);
$graph2->lineTo(2,8,'blue',2);
plot_functions($graph1,$p1);
plot_functions($graph2,$p2);
$graph1->fillRegion([0,0,'green']);
$graph2->fillRegion([0,5,'green']);
@ops = (separation=>30, indent=>0);
$imageTable =
  BeginTable().
    Row([image(insertGraph($graph1),width=>300),image(insertGraph($graph2),width=>300)],@ops).
    AlignedRow([bold('A'),bold('B')],@ops).
  EndTable();
$sl = new_select_list();
$sl->{separation} = 10;
$sl->qa(
  "\(x+y < $c\)", "A",
  "\(x \le 2\) and \(y \ge 4\;\)", "B"
);
$sl->choose(2);
BEGIN_TEXT
Match the inequalities with the graphs.
$PAR $imageTable $PAR
\{$sl->print_q\}
END_TEXT
ANS(str_cmp($sl->ra_correct_ans));
ENDDOCUMENT();`);

assert.doesNotMatch(output, /Unrecognized|Not converted|answer blanks/);
assert.match(
    output,
    /<function name="p1" domain="\[-8,8\]" stylenumber="1" lineStyle="dashed">-x\+\$c<\/function>/,
);
assert.match(
    output,
    /<function name="graph1Edge">0 \+ 8 sign\(0 - \$\$p1\(0\)\)<\/function>/,
);
assert.match(
    output,
    /<sideBySide>\s*<figure suppressFigureNameInCaption>\s*<graph[^>]*>\s*<!-- TODO: describe this graph[^>]*-->\s*<shortDescription>Graph A<\/shortDescription>\s*\$p1\s*<regionBetweenCurves boundaryValues="-8 8">\$p1 \$graph1Edge<\/regionBetweenCurves>\s*<\/graph>\s*<caption>A<\/caption>/,
);
assert.match(
    output,
    /<lineSegment endpoints="\(2,4\) \(2,8\)"\/>\s*\$p2\s*<regionBetweenCurves boundaryValues="-8 2">/,
);
// The order is picked in <setup>, and the list and the <givenAnswer> both
// follow it
assert.match(
    output,
    /<selectFromSequence name="ord" from="1" to="2" numToSelect="2"\/>\s*<group name="questions">\s*<label><m>x\+y < \$c<\/m><\/label>\s*<label><m>x \\le 2<\/m> and <m>y \\ge 4\\;<\/m><\/label>\s*<\/group>\s*<textList name="keys">A B<\/textList>\s*<\/setup>/,
);
assert.doesNotMatch(output, /<shuffle>|credit=/);
assert.match(
    output,
    /<ol>\s*<li>\s*<choiceInput inline name="ci1">\$questions\[\$ord\[1\]\]\s*<choice>A<\/choice>\s*<choice>B<\/choice>\s*<\/choiceInput>\s*<answer inline name="ans1" forceSmallCheckWorkButton><award><when>\$ci1 = \$keys\[\$ord\[1\]\]<\/when><\/award><\/answer>\s*<\/li>/,
);
assert.match(
    output,
    /<givenAnswer>\s*<ol>\s*<li>\$questions\[\$ord\[1\]\]: \$keys\[\$ord\[1\]\]<\/li>\s*<li>\$questions\[\$ord\[2\]\]: \$keys\[\$ord\[2\]\]<\/li>\s*<\/ol>\s*<\/givenAnswer>/,
);
assert.doesNotMatch(output, /<p>\s*<sideBySide|<p>\s*<ol/);

// The same curve plotted twice on a graph is drawn once, curves of the same
// color share a style, non_zero_random only excludes 0 when it's in range,
// and the note about enlarging images becomes one about zooming
output = convert(String.raw`DOCUMENT();
$a = non_zero_random(2,4,1);
$b = non_zero_random(-3,3,1);
$p0 = FEQ("x for x in <-8,8> using color:green weight:2");
$graph1 = init_graph(-8,-8,8,8,'axes'=>[0,0]);
$graph2 = init_graph(-8,-8,8,8,'axes'=>[0,0]);
$p1a = FEQ("(x-$a)^4 for x in <-8,8> using color:blue weight:2");
$p1b = FEQ("(x-$a)^4 for x in <-8,8> using color:blue weight:2");
$p2a = FEQ("x^4-$b for x in <-8,8> using color:blue weight:2");
$p2b = FEQ("x^4+$b for x in <-8,8> using color:red weight:2");
plot_functions($graph1,$p1a,$p1b);
plot_functions($graph2,$p2a,$p2b,$p0);
BEGIN_TEXT
\{ image(insertGraph($graph1)) \} \{ image(insertGraph($graph2)) \}
$BBOLD Note: $EBOLD $BITALIC You can click on the graphs to enlarge the images.$EITALIC
END_TEXT
ENDDOCUMENT();`);

assert.match(output, /<selectFromSequence name="a" from="2" to="4"\/>/);
assert.match(
    output,
    /<selectFromSequence name="b" from="-3" to="3" exclude="0"\/>/,
);
assert.doesNotMatch(output, /p1b/);
assert.match(output, /name="p1a" domain="\[-8,8\]" stylenumber="1">/);
assert.match(output, /name="p2a" domain="\[-8,8\]" stylenumber="1">/);
assert.match(output, /name="p2b" domain="\[-8,8\]" stylenumber="2">/);
// Blue and red are DoenetML's styles 1 and 2 even when another color comes
// first; other colors get the next free style
assert.match(output, /name="p0" domain="\[-8,8\]" stylenumber="3">/);
assert.match(output, /\$p2a\s*\$p2b\s*\$p0/);
assert.match(
    output,
    /<em> Use the \(\+\) symbol in the lower-right corner of the graph to zoom in\.<\/em>/,
);

// A select list showing only some of its questions: the order picks 2 of
// the 3, and the answers can be given since they follow the same order.
// The list's names don't clash with names already in setup.
output = convert(String.raw`DOCUMENT();
$ord = random(1,3,1);
$sl = new_select_list();
$sl->qa("\(1=1\)", "T", "\(1=2\)", "F", "\(2=2\)", "T");
$sl->choose(2);
BEGIN_TEXT
\{$sl->print_q\} $ord
END_TEXT
ANS(str_cmp($sl->ra_correct_ans));
ENDDOCUMENT();`);

assert.match(
    output,
    /<selectFromSequence name="ord2" from="1" to="3" numToSelect="2"\/>/,
);
assert.match(output, /<textList name="keys">T F T<\/textList>/);
assert.match(
    output,
    /<choiceInput inline name="ci2">\$questions\[\$ord2\[2\]\]\s*<choice>F<\/choice>\s*<choice>T<\/choice>/,
);
assert.doesNotMatch(output, /ci3/);
assert.match(
    output,
    /<li>\$questions\[\$ord2\[2\]\]: \$keys\[\$ord2\[2\]\]<\/li>/,
);

// list_random picks one of its values
output = convert(String.raw`DOCUMENT();
$a = list_random(2,6);
$b = list_random('cat','dog');
$c = list_random("a pig","a cow");
$d = list_random(sqrt(2), pi/4);
BEGIN_TEXT
\{ ans_rule(10) \}
END_TEXT
ANS(Compute("$a")->cmp);
ENDDOCUMENT();`);

assert.doesNotMatch(output, /Unknown function/);
assert.match(output, /<select name="a" type="number">2 6<\/select>/);
assert.match(output, /<select name="b" type="text">cat dog<\/select>/);
assert.match(
    output,
    /<select name="c"><option><text>a pig<\/text><\/option><option><text>a cow<\/text><\/option><\/select>/,
);
assert.match(
    output,
    /<select name="d"><option><math>sqrt\(2\)<\/math><\/option><option><math>pi\/4<\/math><\/option><\/select>/,
);

// Pop-up menus, including one whose answer depends on an if block
output = convert(String.raw`DOCUMENT();
$a = random(1,2,1);
if ($a==1){
$popup1 = PopUp(['?','Yes','No'],'Yes');
}
if ($a==2){
$popup1 = PopUp(['?','Yes','No'],'No');
}
$popup2 = PopUp(['?','Yes','No'],'No');
BEGIN_TEXT
\{$popup1->menu\} Is it a function?
$PAR
\{$popup2->menu\} Is it one-to-one?
END_TEXT
ANS($popup1->cmp);
ANS($popup2->cmp);
ENDDOCUMENT();`);

assert.doesNotMatch(output, /Unrecognized|answer blanks/);
assert.match(
    output,
    /<answer inline name="ans1"><shortDescription>Is it a function\?<\/shortDescription><choiceInput inline name="ans1Input"><choice>Yes<\/choice><choice>No<\/choice><\/choiceInput><award><when>\(\$a=1 and \$ans1Input\.selectedIndices = 1\) or \(\$a=2 and \$ans1Input\.selectedIndices = 2\)<\/when><\/award><\/answer>/,
);
assert.match(
    output,
    /<answer inline name="ans2"><shortDescription>Is it one-to-one\?<\/shortDescription><choice>Yes<\/choice><choice credit="1">No<\/choice><\/answer>/,
);
assert.match(
    output,
    /<conditionalContent><case condition="\$a=1"><p>Is it a function\?: Yes<\/p><\/case>/,
);

// If blocks that switch on a random value become a <select>
output = convert(String.raw`DOCUMENT();
$a = random(1,2,1);
$graph1 = init_graph(-5,-5,5,5);
if ($a==1){
$p1 = FEQ("x+1 for x in <-5,0> using color:blue");
$c = Compute("2x");
plot_functions($graph1,$p1);
}
if ($a==2){
$p1 = FEQ("x-4 for x in <0,4> using color:blue");
$p2 = FEQ("-x+4 for x in <0,4> using color:blue");
$c = Compute("3x");
plot_functions($graph1,$p1,$p2);
}
$d = Compute("$a + 1");
BEGIN_TEXT
Case $a.
$PAR
\{ image(insertGraph($graph1),width=>200) \}
$PAR
\{ ans_rule(10) \}
END_TEXT
ANS($c->cmp);
ENDDOCUMENT();`);

assert.doesNotMatch(output, /Unrecognized|defined differently/);
assert.match(
    output,
    /<select name="s1">\s*<option>\s*<number name="a">1<\/number>\s*<function name="p1" domain="\[-5,0\]"[^>]*>x\+1<\/function>\s*<math name="c" simplify="full">2x<\/math>\s*<group name="graph1Plot">\$p1<\/group>\s*<\/option>/,
);
const option2 = output.match(
    /<option>\s*<number name="a">2<\/number>[\s\S]*?<\/option>/,
)[0];
assert.match(
    option2,
    /<function name="p1" domain="\[0,4\]"[^>]*>x-4<\/function>/,
);
assert.match(option2, /<function name="p2"[^>]*>-x\+4<\/function>/);
assert.match(option2, /<math name="c" simplify="full">3x<\/math>/);
assert.match(option2, /<group name="graph1Plot">\$p1 \$p2<\/group>/);
assert.match(output, /<math name="d" simplify="full">\$s1\.a \+ 1<\/math>/);
assert.match(output, /<p>Case \$s1\.a\.<\/p>/);
assert.match(
    output,
    /<graph[^>]*>\s*<!-- TODO: describe this graph[^>]*-->\s*<shortDescription>A graph<\/shortDescription>\s*\$s1\.graph1Plot\s*<\/graph>/,
);
assert.match(output, /<answer name="ans1">\$s1\.c<\/answer>/);
assert.doesNotMatch(output, /<selectFromSequence name="a"/);

// ...but not when there's an else block: keep the old behavior and warn
output = convert(String.raw`DOCUMENT();
$a = random(1,2,1);
$graph1 = init_graph(-5,-5,5,5);
if ($a==1){
$p1 = FEQ("x+1 for x in <-5,0>");
} else {
$p1 = FEQ("x-4 for x in <0,4>");
}
plot_functions($graph1,$p1);
BEGIN_TEXT
\{ image(insertGraph($graph1),width=>200) \}
END_TEXT
ENDDOCUMENT();`);

assert.match(output, /p1 is defined differently in if blocks/);
assert.doesNotMatch(output, /<select /);

// A two-part MultiAnswer shown as a fraction, with a custom checker
// (from Alg 10.4.2 in the PreCalculus library; OPL, author Paul Pearson)
output = convert(String.raw`DOCUMENT();
$a = random(3,9,2);
$b = random(2,8,2);
$n = random(2,9,1);
$fraction = "\frac{\displaystyle \frac{$a}{x} }{ \displaystyle \frac{$b}{x^{$n}} }";
$num = Formula("$a * x^($n-1)")->reduce;
$den = Formula("$b")->reduce;
$numbogus = Formula("$a * $b");
$denbogus = Formula("x^($n+1)");
$multians = MultiAnswer($num, $den)->with(
  singleResult => 0,
  checker => sub {
      my ( $correct, $student, $ansHash ) = @_;
      my ( $f1stu, $f2stu ) = @{$student};
      my ( $f1, $f2 ) = @{$correct};
      if ( ($f1 == $f1stu && $f2 == $f2stu) ) {
          return [1,1];
      } elsif ($numbogus==$f1stu || $denbogus==$f2stu) {
          $ansHash->setMessage(1,"Multiply by its reciprocal");
          return [0,0];
      } elsif ( $f1*$f2stu==$f1stu*$f2 ) {
          $ansHash->setMessage(1,"Simplify your answer further");
          return [0,0];
      } elsif ( $f1stu == 0 ) {
          $ansHash->setMessage(1,"Not zero");
          return [0,0];
      }
  }
);
if ($displayMode eq 'TeX') {
  $showfraction = "\[ $fraction = ".$multians->ans_rule(10)." \]";
} else {
  $showfraction = ColumnTable(
  "\( \displaystyle $fraction = \)",
  $multians->ans_rule(20).$BR.$HR.$multians->ans_rule(20),
  indent => 0, separation => 10
  );
}
BEGIN_TEXT
Simplify.
$PAR
$showfraction
END_TEXT
ANS($multians->cmp());
ENDDOCUMENT();`);

assert.doesNotMatch(
    output,
    /Unrecognized|Unknown function|answer blanks|No answers/,
);
assert.match(
    output,
    /<math name="fraction">\( \(\$a\)\/\(x\) \)\/\( \(\$b\)\/\(x\^\(\$n\)\) \)<\/math>/,
);
assert.match(output, /<math name="num" simplify="full">/);
assert.match(
    output,
    /<p><answer name="ans1"><label><m>\\displaystyle \$fraction = <\/m><\/label>\s*<award credit="1" symbolicEquality>\$num\/\$den<\/award>/,
);
assert.match(
    output,
    /<award name="ans1Simplify" credit="0">\$num\/\$den<\/award>/,
);
assert.match(
    output,
    /<award name="ans1Mistake1" credit="0">\$numbogus\/\$denbogus<\/award>/,
);
assert.match(output, /Not converted: checker message "Not zero"/);
assert.match(
    output,
    /<\/answer><\/p>\s*<feedback condition="\$ans1Simplify">Simplify your answer further<\/feedback>\s*<feedback condition="\$ans1Mistake1">Multiply by its reciprocal<\/feedback>/,
);
assert.match(
    output,
    /<p><m>\\displaystyle \$fraction = \\frac\{\$num\}\{\$den\}<\/m><\/p>/,
);

// A MultiAnswer whose blanks aren't a fraction: one answer per part
output = convert(String.raw`DOCUMENT();
$p = Compute("2");
$q = Compute("3");
$m = MultiAnswer($p, $q)->with(singleResult => 0);
BEGIN_TEXT
\(x =\) \{$m->ans_rule(10)\} and \(y =\) \{$m->ans_rule(10)\}
END_TEXT
ANS($m->cmp());
ENDDOCUMENT();`);

assert.match(
    output,
    /<answer name="ans1"><label><m>x = <\/m><\/label>\$p<\/answer> and <answer name="ans2"><label><m>y = <\/m><\/label>\$q<\/answer>/,
);

// A MultiAnswer whose checker accepts its parts in either order: inputs
// checked by one answer with an award for each order. Image sizes are
// dropped. (From "Problem 17" of the UMTYMP Calculus 1 summer assignment;
// OPL, author Justin Sukiennik)
const anyOrderProblem = (condition) => String.raw`DOCUMENT();
$w = 400;  # graph size
$tw = 500; # graph size in TeX
$a = random(-2,-1,1);
$c = random(2,3,1);
$ans = Real("$a");
$b = Real("1");
$graph1 = init_graph(-8,-8,8,8,'axes'=>[0,0]);
$multians = MultiAnswer($b, $c)->with(
  singleResult => 0,
  checker => sub {
      my ( $correct, $student, $self ) = @_;
      my ( $f1stu, $f2stu ) = @{$student};
      my ( $f1, $f2 ) = @{$correct};
      if ( ${condition} ) {
          return [1,1];
      } else {
          if ($f1 == $f1stu || $f2 == $f1stu) {
              return [1,0];
          } else {
              return [0,0];
          }
      }
  }
);
BEGIN_TEXT
\{image(insertGraph($graph1),width=>$w,height=>$w,tex_size=>$tw)\}
Answer: \(a =\) \{ans_rule(10)\}, \(b =\) \{$multians->ans_rule(10)\}, and \(c =\) \{$multians->ans_rule(10)\}
END_TEXT
ANS( $ans->cmp );
ANS( $multians->cmp() );
ENDDOCUMENT();`;

output = convert(
    anyOrderProblem(
        "($f1 == $f1stu && $f2 == $f2stu) ||\n           ($f1 == $f2stu && $f2 == $f1stu)",
    ),
);
assert.doesNotMatch(output, /name="w"|name="tw"/);
assert.match(
    output,
    /<answer name="ans1"><label><m>a = <\/m><\/label>\$ans<\/answer>, <mathInput name="multians1"><label><m>b = <\/m><\/label><\/mathInput>, and <mathInput name="multians2"><label><m>c = <\/m><\/label><\/mathInput><!-- Not converted: partial credit[^>]*--><answer name="ans2"><shortDescription>Check b and c<\/shortDescription><award><when>\$multians1 = \$b and \$multians2 = \$c<\/when><\/award><award><when>\$multians1 = \$c and \$multians2 = \$b<\/when><\/award><\/answer>/,
);
assert.match(
    output,
    /<givenAnswer>\s*<p><m>a = \$ans<\/m><\/p>\s*<p><m>b = \$b,\\; c = \$c<\/m><\/p>\s*<p>or<\/p>\s*<p><m>b = \$c,\\; c = \$b<\/m><\/p>\s*<\/givenAnswer>/,
);

// The comparisons can be written either way round
output = convert(
    anyOrderProblem(
        "($f2stu == $f2 && $f1stu == $f1) || ($f2 == $f1stu && $f2stu == $f1)",
    ),
);
assert.match(output, /<mathInput name="multians1">/);

// Anything else is not any-order: one order only, or an extra condition
for (const condition of [
    "($f1 == $f1stu && $f2 == $f2stu)",
    "($f1 == $f1stu && $f2 == $f2stu) || ($f1 == $f1stu && $f2 == $f2stu)",
    "($f1 == $f1stu && $f2 == $f2stu) || ($f1 == $f2stu && $f2 == $f1stu) || $f1 == 0",
    "($f1 == $f1stu && $f2 == $f2stu) || ($f1 == $f2stu && $f2 == $f1stu && $f1 > 0)",
]) {
    output = convert(anyOrderProblem(condition));
    assert.doesNotMatch(output, /<mathInput/, condition);
    assert.match(
        output,
        /Not converted: custom checker for MultiAnswer \$multians/,
        condition,
    );
}

// Evaluating formulas, $ans1-style names, and numbered questions as parts
// (from "Problem 13" of the UMTYMP Calculus 1 summer assignment; OPL,
// author Justin Sukiennik)
output = convert(String.raw`DOCUMENT();
$a = random(-6,-2,1);
$b = random(3,8,1);
$f = Formula("$a*x+$b");
$g = Formula("$a*t");
$ans1 = $f->eval(x=>-4);
$ans2 = $g->eval(t=>2);
BEGIN_TEXT
Find the following values. $PAR
$BBOLD 1. $EBOLD \( f(-4) = \) \{ ans_rule(20) \} $PAR
$BBOLD 2. $EBOLD \( g(2) = \) \{ ans_rule(20) \} $PAR
3. Not a question.
END_TEXT
ANS($ans1->cmp);
ANS($ans2->cmp);
ENDDOCUMENT();`);

assert.doesNotMatch(output, /->eval|name="ans1">\$|<math name="ans/);
assert.match(
    output,
    /<function name="f" simplify="numbersPreserveOrder">\$a\*x\+\$b<\/function>/,
);
assert.match(
    output,
    /<function name="g" simplify="numbersPreserveOrder" variables="t">\$a\*t<\/function>/,
);
assert.match(output, /<math name="sol1">\$\$f\(-4\)<\/math>/);
assert.match(output, /<math name="sol2">\$\$g\(2\)<\/math>/);
assert.match(
    output,
    /<part>\s*<p><answer name="ans1"><label><m>f\(-4\) = <\/m><\/label>\$sol1<\/answer><\/p>\s*<\/part>/,
);
assert.match(output, /<p>3\. Not a question\.<\/p>/);
assert.match(
    output,
    /<givenAnswer>\s*<part><m>f\(-4\) = \$sol1<\/m><\/part>\s*<part><m>g\(2\) = \$sol2<\/m><\/part>\s*<\/givenAnswer>/,
);
assert.match(
    output,
    /<\/setup>\s*<!-- testing -->\s*<!-- <p>sol1 = \$sol1<\/p>\s*<p>sol2 = \$sol2<\/p> -->\s*<!-- \/testing -->/,
);

// std_problem_grader gives credit only if every answer is right: each
// answer becomes its input, and one answer after the last requires them all
const stdGrader = (body) => String.raw`DOCUMENT();
install_problem_grader(~~&std_problem_grader);
${body}
ENDDOCUMENT();`;

// Math blanks and a pop-up
output = convert(
    stdGrader(String.raw`$a = Compute("2");
$b = Compute("3");
$p = PopUp(['?','Yes','No'],'No');
BEGIN_TEXT
\(x =\) \{ans_rule(10)\} and \(y =\) \{ans_rule(10)\}
$PAR
\{$p->menu\} Is it?
END_TEXT
ANS($a->cmp);
ANS($b->cmp);
ANS($p->cmp);`),
);
assert.doesNotMatch(output, /<answer name="ans[23]"|credit=/);
assert.match(
    output,
    /<mathInput name="ans1Input"><label><m>x = <\/m><\/label><\/mathInput> and <mathInput name="ans2Input"><label><m>y = <\/m><\/label><\/mathInput>/,
);
assert.match(
    output,
    /<choiceInput inline name="ans3Input"><shortDescription>Is it\?<\/shortDescription><choice>Yes<\/choice><choice>No<\/choice><\/choiceInput><answer name="ans1"><shortDescription>Check all answers<\/shortDescription><award><when>\$ans1Input = \$a and \$ans2Input = \$b and \$ans3Input\.selectedIndices = 2<\/when><\/award><\/answer>/,
);
// The given answers are unchanged
assert.match(
    output,
    /<givenAnswer>\s*<p><m>x = \$a<\/m><\/p>\s*<p><m>y = \$b<\/m><\/p>/,
);

// A select list: the answer goes after the list
output = convert(
    stdGrader(String.raw`$sl = new_select_list();
$sl->qa("\(1=1\)", "T", "\(1=2\)", "F");
$sl->choose(2);
BEGIN_TEXT
\{$sl->print_q\}
END_TEXT
ANS(str_cmp($sl->ra_correct_ans));`),
);
assert.doesNotMatch(output, /forceSmallCheckWorkButton/);
assert.match(
    output,
    /<\/choiceInput>\s*<\/li>\s*<\/ol>\n<answer name="ans1"><shortDescription>Check all answers<\/shortDescription><award><when>\(\$ci1 = \$keys\[\$ord\[1\]\]\) and \(\$ci2 = \$keys\[\$ord\[2\]\]\)<\/when><\/award><\/answer>/,
);

// An any-order MultiAnswer: no note about partial credit, since there is none
output = convert(
    anyOrderProblem(
        "($f1 == $f1stu && $f2 == $f2stu) || ($f1 == $f2stu && $f2 == $f1stu)",
    ).replace(
        "DOCUMENT();",
        "DOCUMENT();\ninstall_problem_grader(~~&std_problem_grader);",
    ),
);
assert.doesNotMatch(output, /partial credit/);
assert.match(
    output,
    /<mathInput name="ans1Input"><label><m>a = <\/m><\/label><\/mathInput>, <mathInput name="multians1">[\s\S]*?<\/mathInput><answer name="ans1"><shortDescription>Check all answers<\/shortDescription><award><when>\$ans1Input = \$ans and \(\(\$multians1 = \$b and \$multians2 = \$c\) or \(\$multians1 = \$c and \$multians2 = \$b\)\)<\/when><\/award><\/answer>/,
);

// <part>s, or one answer: left as they are
output = convert(
    stdGrader(String.raw`$a = Compute("2");
BEGIN_TEXT
\(x =\) \{ans_rule(10)\}
END_TEXT
ANS($a->cmp);`),
);
assert.match(
    output,
    /<answer name="ans1"><label><m>x = <\/m><\/label>\$a<\/answer>/,
);
assert.doesNotMatch(output, /all-or-nothing|Check all answers/);

// Points, lists and intervals, and a numbered question with its answer on
// the next line (from OPL, author Justin Sukiennik)
output = convert(String.raw`DOCUMENT();
loadMacros("PGstandard.pl", "MathObjects.pl", "weightedGrader.pl");
install_weighted_grader();
$a = random(2,8,2);
$b = Compute("$a+2");
$an1 = Point(0,$b);
$an2a = Point(-$a,0);
$an2b = Point($b,0);
$ans1 = List($an1);
$ans2 = List($an2a,$an2b);
$ans3 = Union("(-inf,-$a) U [$b,inf)");
BEGIN_TEXT
$BBOLD 1.$EBOLD Find the \(y\)-intercept(s). $BR
Answer (separate by commas): \{ans_rule(30)\} $PAR
$BBOLD 2.$EBOLD Find the \(x\)-intercept(s). $BR
Answer (separate by commas): \{ans_rule(30)\} $PAR
$BBOLD 3.$EBOLD Where is \(f(x) > 0\)? $BR
Answer (in interval notation): \{ans_rule(30)\} $PAR
END_TEXT
WEIGHTED_ANS( ($ans1)->cmp(showHints=>0), 25 );
WEIGHTED_ANS( ($ans2)->cmp(showHints=>0), 25 );
WEIGHTED_ANS( ($ans3)->cmp(), 50 );
ENDDOCUMENT();`);

assert.match(output, /<point name="an1" x="0" y="\$b"\/>/);
assert.match(output, /<math name="sol1">\$an1<\/math>/);
assert.match(output, /<mathList name="sol2">\$an2a \$an2b<\/mathList>/);
assert.match(
    output,
    /<math name="sol3"><interval>\(-infinity,-\$a\) union \[\$b,infinity\)<\/interval><\/math>/,
);
assert.match(
    output,
    /<part>\s*<p>Find the <m>y<\/m>-intercept\(s\)\.\s*<\/p>\s*<p><answer name="ans1" weight="25"><label>Answer \(separate by commas\): <\/label>\$sol1<\/answer><\/p>\s*<\/part>/,
);
assert.match(
    output,
    /<answer name="ans2" unorderedCompare weight="25"><label>Answer \(separate by commas\): <\/label>\$sol2<\/answer>/,
);
assert.match(
    output,
    /<answer name="ans3" weight="50"><mathInput unionFromU><label>Answer \(in interval notation\): <\/label><\/mathInput>\$sol3<\/answer>/,
);
assert.match(output, /<givenAnswer>\s*<part><m>\$sol1<\/m><\/part>/);
assert.doesNotMatch(output, /Unknown function|\(\$sol|alert> 1\./);

// An interval is simplified, so 5/$b shows cleanly; a union isn't, since
// that would reorder its intervals
output = convert(String.raw`DOCUMENT();
$b = random(1,4,1);
$in1 = Interval("(-inf,5/$b)");
$ans = Union("$in1 U (5/$b,inf)");
BEGIN_TEXT
\{ans_rule(10)\}
END_TEXT
ANS($ans->cmp);
ENDDOCUMENT();`);
assert.match(
    output,
    /<math name="in1" simplify="full"><interval>\(-infinity,5\/\$b\)<\/interval><\/math>/,
);
assert.match(output, /<math name="ans"><interval>/);

// Equal weights are left out; a numbered line that isn't followed by its
// answer stays a paragraph
output = convert(String.raw`DOCUMENT();
$a = Compute("2");
$b = Compute("3");
BEGIN_TEXT
$BBOLD 1.$EBOLD Read this. $PAR
Some text. $PAR
\(x =\) \{ans_rule(10)\} $PAR
$BBOLD 2.$EBOLD Last. $PAR
\(y =\) \{ans_rule(10)\}
END_TEXT
WEIGHTED_ANS($a->cmp, 50);
WEIGHTED_ANS($b->cmp, 50);
ENDDOCUMENT();`);
assert.doesNotMatch(output, /weight=/);
assert.match(
    output,
    /<p><alert> 1\.<\/alert> Read this\.<\/p>\s*<p>Some text\.<\/p>\s*<p><answer name="ans1">/,
);
assert.match(output, /<part>\s*<p>Last\.<\/p>\s*<p><answer name="ans2">/);

console.log("webwork-to-doenetml smoke test passed");
