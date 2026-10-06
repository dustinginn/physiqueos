#!/bin/zsh
# usage: capture.sh OUTDIR route theme state name [extra args...]
J=<work>; UDID=$(cat $J/udid); BID=$(cat $J/bid)
OUT=$1; ROUTE=$2; THEME=$3; STATE=$4; NAME=$5; shift 5
mkdir -p $OUT
xcrun simctl terminate $UDID $BID >/dev/null 2>&1
xcrun simctl launch $UDID $BID -physiqueos.appearance-review.route $ROUTE -physiqueos.appearance-review.value $THEME -physiqueos.evidence-review -physiqueos.evidence-review.state $STATE "$@" >/dev/null
sleep ${WAIT:-5}
xcrun simctl io $UDID screenshot $OUT/$NAME.png >/dev/null 2>&1
