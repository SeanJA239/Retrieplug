# 等待实现的功能
1. 按下CTRL+shift+num，出现文件的名字
2. pinboard的位置可以拖动并且锁定
3. 公式点击就复制
4. Gemini输入网址出现文字而非http的内容

# ui的修改顺序：
1. 修改为把上传的图片顺序有关，而不是剪切板的内容。
2. 文本框的内容长度过长会导致设置界面看不了

# specific funtions
## 文件名相关
1. 在AI界面的输入框内可以粘贴文件，但是AI的幻觉和其他的部分会导致无法识别具体图片。所以需要做出功能是识别在输入框内的图片顺序，按下CTRL+shift+num就显示出来具体文件的名字。如文本款第一个输入的是image.png，第二个是readme.md。那么按下CTRL+shift+1的时候就会在对话框自动输出第一个文件的文件名，即image.png。按下CTRL+shift+2的时候就会在对话框自动输出第二个文件的文件名，即readme.md
## 公式复制相关
1. 可以参考https://github.com/Nagi-ovo/gemini-voyager的部分，实现公式单独起一行/点击就可以直接复制latex/mathml的功能
## pinboard位置可修改
1. pinboard的版本目前是固定的，位置是右边的sidebar的中间。想设置成pinboard的位置是默认在现在的位置（右边sidebar的中间），并且有按键点击的时候可以实现自由拖动（在界面的边框位置），再点击就锁定位置。
## readme修改的部分
1. 在readme界面写清楚更新的方式（首先用git功能，更新最新的代码，然后chrome://extensions/的重新加载，并且刷新AI界面）
2. readme增加上截图（png/gif）
3. 更新readme部分：完全本地运行，不经过服务器，安全性。
## chrome的图表部分
1. 在edge的扩展的界面（chrome://extensions/）设置图表，即Retrieplug Logo
## AI界面的适配问题
1. 其他常见AI的界面的不合适（1豆包的对话显示的数字，2支持deepseek/kimi的部分）
## 文本导出问题
1. 目前的导出是json文档，显示的是pin的内容。pin的ui是现实前150字的，所以导出的部分也是不完整的。技术上实现pin的内容是全部的，但是在pinboard上只显示出来前150字。在导出的时候也就是完整的内容。
2.  导出的部分不只是json格式，可以手动选择json/md/pdf等