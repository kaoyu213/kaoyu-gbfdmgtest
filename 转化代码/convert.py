import pandas as pd
import json
import os

# 1. 配置文件名
FILE_NAME = 'skills.xlsx'
OUTPUT_FILE = 'skills.json'

# 2. 检查文件是否存在
if not os.path.exists(FILE_NAME):
    print(f"❌ 错误: 找不到文件 {FILE_NAME}。")
    print("请确保 Excel 文件在当前脚本的同一目录下。")
    exit()

print(f"正在读取 {FILE_NAME} ...")

try:
    # 3. 读取 Excel
    # dtype=str: 强制所有单元格作为字符串读取，防止 '10:10%' 被自动转成日期或数字
    # engine='openpyxl': 需要安装 openpyxl 库
    df = pd.read_excel(FILE_NAME, dtype=str, engine='openpyxl')
except Exception as e:
    print(f"❌ 读取 Excel 失败: {e}")
    print("提示: 请确保已安装依赖库 -> pip install pandas openpyxl")
    exit()

# 4. 数据清洗
# 将所有 NaN (空值) 替换为空字符串
df = df.fillna('')

# ★关键步骤★：去除表头列名的前后空格，防止 Excel 里有看不见的空格导致读取失败
df.columns = df.columns.str.strip()

skills_list = []
count = 0

# 5. 遍历每一行数据
for index, row in df.iterrows():
    # 获取 ID，如果为空则跳过该行
    skill_id = str(row.get('ID', '')).strip()
    if not skill_id:
        continue

    # 处理特殊条件代码
    raw_condition = str(row.get('特殊条件代码', '')).strip()
    condition = ""
    # 过滤掉 'no', 'nan', 'none' 等无效值
    if raw_condition and raw_condition.lower() not in ['no', 'nan', 'none', '']:
        condition = raw_condition

    # 构建基础数据对象
    skill_data = {
        "id": skill_id,
        "name": str(row.get('中文名', '')).strip(),
        "description": str(row.get('描述', '')).strip(),
        "image": str(row.get('UI图标', '')).strip(),
        
        # 读取生效配置，如果没有填则给默认值
        "element": str(row.get('生效属性', 'weapon')).strip(), 
        "race": str(row.get('生效种族', 'all')).strip(),       
        "position": str(row.get('生效位置', 'all')).strip(),   
        
        "condition": condition,
        "effects": []
    }

    # 6. 循环读取 效果1 到 效果5
    # 根据你提供的表头：效果X_类型名 / 效果X_加护 / 效果X_数值
    for i in range(1, 6):
        col_type = f'效果{i}_类型名'
        col_boost = f'效果{i}_加护'
        col_value = f'效果{i}_数值'

        # 检查 "类型名" 这一列是否存在于 Excel 中
        if col_type not in df.columns:
            # 如果是 效果1 就不存在，说明表头可能不对，打印警告
            if i == 1:
                print(f"⚠️ 警告: 未找到列名 '{col_type}'，请检查 Excel 表头是否完全一致。")
            continue

        # 获取类型名
        prop_val = str(row.get(col_type, '')).strip()

        # 只有当 "类型名" 有内容时，才视为有效技能效果
        if prop_val:
            # 获取加护类型 (默认为 none)
            boost_val = str(row.get(col_boost, '')).strip()
            if not boost_val or boost_val.lower() == 'nan':
                boost_val = 'none'
            
            # 获取数值
            val_val = str(row.get(col_value, '')).strip()

            # 添加到 effects 数组
            effect = {
                "prop": prop_val,   # 例如: weapon_normal_atk
                "boost": boost_val, # 例如: optimus
                "value": val_val    # 例如: 10:10%
            }
            skill_data['effects'].append(effect)

    skills_list.append(skill_data)
    count += 1

# 7. 写入 JSON 文件
try:
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(skills_list, f, ensure_ascii=False, indent=2)
    
    print("-" * 30)
    print(f"✅ 成功！")
    print(f"已处理条目数: {count}")
    print(f"文件已保存为: {os.path.abspath(OUTPUT_FILE)}")
    print("-" * 30)

    # 简单自检：打印第一条数据看看对不对
    if count > 0:
        print("🔍 第一条数据预览:")
        print(json.dumps(skills_list[0], ensure_ascii=False, indent=2))
        
        if len(skills_list[0]['effects']) == 0:
            print("\n⚠️ 注意：第一条数据的 effects 列表为空。")
            print("如果 Excel 里第一行有数据，请再次检查列名是否完全匹配（不要有空格）。")

except Exception as e:
    print(f"❌ 写入 JSON 失败: {e}")