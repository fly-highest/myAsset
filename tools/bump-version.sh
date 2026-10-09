#!/bin/sh
# 배포 전에 실행: 화면 파일들의 ?v= 값과 version.txt 를 새 버전으로 바꿉니다.
# 사용법: sh tools/bump-version.sh 20261010d
cd "$(dirname "$0")/.." || exit 1
NEW="$1"; [ -n "$NEW" ] || { echo "새 버전을 입력하세요 (예: 20261010d)"; exit 1; }
OLD=$(cat version.txt | tr -d '\r\n ')
for h in index.html groups.html accounts.html history.html manage.html login.html; do sed -i "s/?v=$OLD/?v=$NEW/g" "$h"; done
printf "%s\n" "$NEW" > version.txt
echo "$OLD -> $NEW"
