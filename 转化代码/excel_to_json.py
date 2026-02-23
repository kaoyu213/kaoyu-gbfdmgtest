import pandas as pd
import json
import os

def excel_to_json(input_file, output_file):
    print(f"正在读取文件: {input_file} ...")
    
    try:
        # 1. 读取 Excel 文件
        # 【修改点】去掉 dtype={'ID': int}，先按默认读取，防止因空行报错
        df = pd.read_excel(input_file)
        
    except FileNotFoundError:
        print(f"错误：找不到文件 '{input_file}'")
        return
    except Exception as e:
        print(f"读取 Excel 时发生未知错误: {e}")
        return

    # 2. 数据清洗：处理 ID 列
    # 【修改点】检查 ID 列是否有空值
    if df['ID'].isnull().any():
        missing_count = df['ID'].isnull().sum()
        print(f"警告：发现 {missing_count} 行数据的 ID 为空，将自动忽略这些行。")
        # 删除 ID 为空的行
        df = df.dropna(subset=['ID'])

    # 【修改点】尝试将 ID 转换为整数
    try:
        df['ID'] = df['ID'].astype(int)
    except ValueError as e:
        print("错误：ID 列中包含无法转换为数字的内容（例如文字或符号）。")
        print("请检查 Excel 中 ID 列是否混入了非数字字符。")
        print(f"具体错误信息: {e}")
        return

    # 3. 处理其他列的空值
    # 将 Excel 中的空值 (NaN) 转换为 "" (空字符串)
    df = df.fillna("")

    # 4. 转换为字典列表
    data = df.to_dict(orient='records')

    # 5. 写入 JSON 文件
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        
        print(f"转换成功！文件已保存为: {output_file}")
        print(f"共处理了 {len(data)} 条有效数据。")
        
    except Exception as e:
        print(f"写入文件时发生错误: {e}")

if __name__ == "__main__":
    # 请确保这里的文件名和你电脑上的实际文件名一致
    INPUT_FILENAME = 'characters.xlsx' 
    OUTPUT_FILENAME = 'chara.json'

    excel_to_json(INPUT_FILENAME, OUTPUT_FILENAME)