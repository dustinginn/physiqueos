#!/bin/zsh
# usage: cap2.sh OUTDIR theme name route [extra args...]
J=<work>; UDID=$(cat $J/udid); BID=$(cat $J/bid)
OUT=$1; THEME=$2; NAME=$3; ROUTE=$4; shift 4
mkdir -p $OUT
xcrun simctl terminate $UDID $BID >/dev/null 2>&1
xcrun simctl launch $UDID $BID -physiqueos.native.authority-selection.v1 sandbox -physiqueos.appearance-review.route "$ROUTE" -physiqueos.appearance-review.value $THEME "$@" >/dev/null
sleep ${WAIT:-7}
xcrun simctl io $UDID screenshot $OUT/$NAME.png >/dev/null 2>&1
